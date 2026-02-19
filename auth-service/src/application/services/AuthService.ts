import { PrismaClient, User as PrismaUser, RefreshToken as PrismaRefreshToken, Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger';
import { hashPassword, comparePassword, validatePasswordStrength } from '../../utils/password';
import {
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  TokenPayload,
  getJtiFromToken,
} from '../../utils/jwt';
import {
  RegisterUserRequestDTO,
  LoginUserRequestDTO,
  RefreshTokenRequestDTO,
  LogoutUserRequestDTO,
  UpdateProfileRequestDTO,
  ChangePasswordRequestDTO,
  RegisterResponseDTO,
  LoginResponseDTO,
  RefreshTokenResponseDTO,
  LogoutResponseDTO,
  UserProfileResponseDTO,
  VerifyTokenResponseDTO,
  mapUserToProfileDTO,
} from '../dto/AuthDTO';

// Custom error classes
export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Auth Service Class
 * Handles all authentication-related business logic
 */
export class AuthService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Register a new user
   */
  async register(
    data: RegisterUserRequestDTO,
    correlationId?: string
  ): Promise<RegisterResponseDTO> {
    const childLogger = logger.child({ correlationId, operation: 'register' });

    try {
      childLogger.info('Starting user registration', { email: data.email });

      // Validate password strength
      const passwordValidation = validatePasswordStrength(data.password);
      if (!passwordValidation.isValid) {
        throw new ValidationError(passwordValidation.message, 'password');
      }

      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser) {
        throw new AuthError('User with this email already exists', 'USER_EXISTS', 409);
      }

      // Hash password
      const hashedPassword = await hashPassword(data.password);

      // Create user
      const user = await this.prisma.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
          role: Role.USER,
          isActive: true,
        },
      });

      childLogger.info('User created successfully', { userId: user.id });

      // Generate tokens
      const tokens = generateTokenPair(user.id, user.email, user.role);

      // Store refresh token
      await this.storeRefreshToken(user.id, tokens.refreshToken, tokens.refreshTokenExpiresAt);

      childLogger.info('User registered successfully', { userId: user.id });

      return {
        user: mapUserToProfileDTO(user),
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: 900, // 15 minutes in seconds
          tokenType: 'Bearer',
        },
        message: 'User registered successfully',
      };
    } catch (error) {
      childLogger.error('Error during user registration', { error });
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(
    data: LoginUserRequestDTO,
    correlationId?: string
  ): Promise<LoginResponseDTO> {
    const childLogger = logger.child({ correlationId, operation: 'login' });

    try {
      childLogger.info('Starting user login', { email: data.email });

      // Find user
      const user = await this.prisma.user.findUnique({
        where: { email: data.email },
      });

      if (!user) {
        throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
      }

      // Check if user is active
      if (!user.isActive) {
        throw new AuthError('Account is deactivated', 'ACCOUNT_DEACTIVATED', 403);
      }

      // Verify password
      const isPasswordValid = await comparePassword(data.password, user.password);

      if (!isPasswordValid) {
        throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
      }

      childLogger.info('Password verified, generating tokens', { userId: user.id });

      // Generate tokens
      const tokens = generateTokenPair(user.id, user.email, user.role);

      // Store refresh token (with rotation - invalidate old tokens for this user)
      await this.storeRefreshToken(user.id, tokens.refreshToken, tokens.refreshTokenExpiresAt);

      childLogger.info('User logged in successfully', { userId: user.id });

      return {
        user: mapUserToProfileDTO(user),
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: 900, // 15 minutes in seconds
          tokenType: 'Bearer',
        },
      };
    } catch (error) {
      childLogger.error('Error during user login', { error });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(
    data: RefreshTokenRequestDTO,
    correlationId?: string
  ): Promise<RefreshTokenResponseDTO> {
    const childLogger = logger.child({ correlationId, operation: 'refreshToken' });

    try {
      childLogger.info('Starting token refresh');

      if (!data.refreshToken) {
        throw new AuthError('Refresh token is required', 'MISSING_REFRESH_TOKEN', 400);
      }

      // Verify refresh token
      let decoded: TokenPayload;
      try {
        decoded = verifyRefreshToken(data.refreshToken);
      } catch (error) {
        throw new AuthError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN', 401);
      }

      // Check if token exists in database
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: data.refreshToken },
        include: { user: true },
      });

      if (!storedToken) {
        throw new AuthError('Refresh token not found', 'TOKEN_NOT_FOUND', 401);
      }

      // Check if token is expired
      if (new Date() > storedToken.expiresAt) {
        // Delete expired token
        await this.prisma.refreshToken.delete({
          where: { id: storedToken.id },
        });
        throw new AuthError('Refresh token expired', 'TOKEN_EXPIRED', 401);
      }

      // Check if user is still active
      if (!storedToken.user.isActive) {
        throw new AuthError('Account is deactivated', 'ACCOUNT_DEACTIVATED', 403);
      }

      childLogger.info('Refresh token valid, generating new tokens', { userId: decoded.userId });

      // Generate new token pair (rotation)
      const tokens = generateTokenPair(
        storedToken.user.id,
        storedToken.user.email,
        storedToken.user.role
      );

      // Delete old refresh token (rotation)
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      // Store new refresh token
      await this.storeRefreshToken(
        storedToken.user.id,
        tokens.refreshToken,
        tokens.refreshTokenExpiresAt
      );

      childLogger.info('Token refreshed successfully', { userId: decoded.userId });

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 900, // 15 minutes in seconds
        tokenType: 'Bearer',
      };
    } catch (error) {
      childLogger.error('Error during token refresh', { error });
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout(
    data: LogoutUserRequestDTO,
    correlationId?: string
  ): Promise<LogoutResponseDTO> {
    const childLogger = logger.child({ correlationId, operation: 'logout' });

    try {
      childLogger.info('Starting logout');

      if (data.refreshToken) {
        // Delete refresh token from database
        await this.prisma.refreshToken.deleteMany({
          where: { token: data.refreshToken },
        });
      }

      childLogger.info('User logged out successfully');

      return {
        message: 'Logged out successfully',
      };
    } catch (error) {
      childLogger.error('Error during logout', { error });
      throw error;
    }
  }

  /**
   * Logout user from all devices (invalidate all refresh tokens)
   */
  async logoutAll(userId: string, correlationId?: string): Promise<LogoutResponseDTO> {
    const childLogger = logger.child({ correlationId, operation: 'logoutAll', userId });

    try {
      childLogger.info('Starting logout from all devices');

      // Delete all refresh tokens for user
      const result = await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      childLogger.info('Logged out from all devices', { deletedTokens: result.count });

      return {
        message: 'Logged out from all devices successfully',
      };
    } catch (error) {
      childLogger.error('Error during logout all', { error });
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getProfile(
    userId: string,
    correlationId?: string
  ): Promise<UserProfileResponseDTO> {
    const childLogger = logger.child({ correlationId, operation: 'getProfile', userId });

    try {
      childLogger.info('Getting user profile');

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
      }

      return mapUserToProfileDTO(user);
    } catch (error) {
      childLogger.error('Error getting user profile', { error });
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: UpdateProfileRequestDTO,
    correlationId?: string
  ): Promise<UserProfileResponseDTO> {
    const childLogger = logger.child({ correlationId, operation: 'updateProfile', userId });

    try {
      childLogger.info('Updating user profile');

      // Check if email is being changed and if it's already taken
      if (data.email) {
        const existingUser = await this.prisma.user.findUnique({
          where: { email: data.email },
        });

        if (existingUser && existingUser.id !== userId) {
          throw new AuthError('Email already in use', 'EMAIL_IN_USE', 409);
        }
      }

      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.lastName && { lastName: data.lastName }),
          ...(data.email && { email: data.email }),
        },
      });

      childLogger.info('User profile updated successfully');

      return mapUserToProfileDTO(user);
    } catch (error) {
      childLogger.error('Error updating user profile', { error });
      throw error;
    }
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    data: ChangePasswordRequestDTO,
    correlationId?: string
  ): Promise<{ message: string }> {
    const childLogger = logger.child({ correlationId, operation: 'changePassword', userId });

    try {
      childLogger.info('Changing user password');

      // Get user
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
      }

      // Verify current password
      const isCurrentPasswordValid = await comparePassword(
        data.currentPassword,
        user.password
      );

      if (!isCurrentPasswordValid) {
        throw new AuthError('Current password is incorrect', 'INVALID_PASSWORD', 401);
      }

      // Validate new password strength
      const passwordValidation = validatePasswordStrength(data.newPassword);
      if (!passwordValidation.isValid) {
        throw new ValidationError(passwordValidation.message, 'newPassword');
      }

      // Hash new password
      const hashedPassword = await hashPassword(data.newPassword);

      // Update password
      await this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      // Invalidate all refresh tokens (force re-login)
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      childLogger.info('Password changed successfully');

      return { message: 'Password changed successfully. Please log in again.' };
    } catch (error) {
      childLogger.error('Error changing password', { error });
      throw error;
    }
  }

  /**
   * Verify access token (for other services)
   */
  async verifyToken(
    token: string,
    correlationId?: string
  ): Promise<VerifyTokenResponseDTO> {
    const childLogger = logger.child({ correlationId, operation: 'verifyToken' });

    try {
      childLogger.info('Verifying token');

      if (!token) {
        return { valid: false, message: 'Token is required' };
      }

      // Remove Bearer prefix if present
      const actualToken = token.startsWith('Bearer ') ? token.slice(7) : token;

      // Verify token
      const decoded = verifyAccessToken(actualToken);

      // Check if user still exists and is active
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        return { valid: false, message: 'User not found' };
      }

      if (!user.isActive) {
        return { valid: false, message: 'Account is deactivated' };
      }

      childLogger.info('Token verified successfully', { userId: decoded.userId });

      return {
        valid: true,
        user: {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role as Role,
        },
      };
    } catch (error) {
      childLogger.warn('Token verification failed', { error });

      if (error instanceof Error) {
        return { valid: false, message: error.message };
      }

      return { valid: false, message: 'Invalid token' };
    }
  }

  /**
   * Store refresh token in database
   */
  private async storeRefreshToken(
    userId: string,
    token: string,
    expiresAt: Date
  ): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        id: uuidv4(),
        token,
        userId,
        expiresAt,
      },
    });
  }

  /**
   * Clean up expired refresh tokens
   */
  async cleanupExpiredTokens(correlationId?: string): Promise<number> {
    const childLogger = logger.child({ correlationId, operation: 'cleanupExpiredTokens' });

    try {
      childLogger.info('Cleaning up expired refresh tokens');

      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      childLogger.info('Expired tokens cleaned up', { deletedCount: result.count });

      return result.count;
    } catch (error) {
      childLogger.error('Error cleaning up expired tokens', { error });
      throw error;
    }
  }

  /**
   * Get user by ID (for internal use)
   */
  async getUserById(userId: string): Promise<PrismaUser | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  /**
   * Check if user has admin role
   */
  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    return user?.role === Role.ADMIN;
  }
}

export default AuthService;
