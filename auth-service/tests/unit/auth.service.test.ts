import { PrismaClient, Role } from '@prisma/client';
import { AuthService, AuthError, ValidationError } from '../../src/application/services/AuthService';
import { hashPassword } from '../../src/utils/password';
import { v4 as uuidv4 } from 'uuid';

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
    Role: {
      USER: 'USER',
      ADMIN: 'ADMIN',
    },
  };
});

describe('AuthService', () => {
  let authService: AuthService;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    authService = new AuthService(mockPrisma);
  });

  describe('register', () => {
    const validRegisterData = {
      email: 'test@example.com',
      password: 'Test123!',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should successfully register a new user', async () => {
      const mockUser = {
        id: uuidv4(),
        email: validRegisterData.email,
        password: 'hashed_password',
        firstName: validRegisterData.firstName,
        lastName: validRegisterData.lastName,
        role: Role.USER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.user.create as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({
        id: uuidv4(),
        token: 'refresh_token',
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const result = await authService.register(validRegisterData);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe(validRegisterData.email);
      expect(result.user.firstName).toBe(validRegisterData.firstName);
      expect(result.user.lastName).toBe(validRegisterData.lastName);
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
    });

    it('should throw error if user already exists', async () => {
      const existingUser = {
        id: uuidv4(),
        email: validRegisterData.email,
        password: 'hashed_password',
        firstName: 'Existing',
        lastName: 'User',
        role: Role.USER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser);

      await expect(authService.register(validRegisterData)).rejects.toThrow(AuthError);
      await expect(authService.register(validRegisterData)).rejects.toThrow('User with this email already exists');
    });

    it('should throw validation error for weak password', async () => {
      const weakPasswordData = {
        ...validRegisterData,
        password: 'weak',
      };

      await expect(authService.register(weakPasswordData)).rejects.toThrow(ValidationError);
    });
  });

  describe('login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'Test123!',
    };

    it('should successfully login with valid credentials', async () => {
      const hashedPassword = await hashPassword(validLoginData.password);
      const mockUser = {
        id: uuidv4(),
        email: validLoginData.email,
        password: hashedPassword,
        firstName: 'John',
        lastName: 'Doe',
        role: Role.USER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({
        id: uuidv4(),
        token: 'refresh_token',
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const result = await authService.login(validLoginData);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe(validLoginData.email);
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
    });

    it('should throw error for non-existent user', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(authService.login(validLoginData)).rejects.toThrow(AuthError);
      await expect(authService.login(validLoginData)).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for inactive account', async () => {
      const hashedPassword = await hashPassword(validLoginData.password);
      const mockUser = {
        id: uuidv4(),
        email: validLoginData.email,
        password: hashedPassword,
        firstName: 'John',
        lastName: 'Doe',
        role: Role.USER,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(authService.login(validLoginData)).rejects.toThrow(AuthError);
      await expect(authService.login(validLoginData)).rejects.toThrow('Account is deactivated');
    });

    it('should throw error for invalid password', async () => {
      const mockUser = {
        id: uuidv4(),
        email: validLoginData.email,
        password: await hashPassword('different_password'),
        firstName: 'John',
        lastName: 'Doe',
        role: Role.USER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(authService.login(validLoginData)).rejects.toThrow(AuthError);
      await expect(authService.login(validLoginData)).rejects.toThrow('Invalid email or password');
    });
  });

  describe('refreshToken', () => {
    it('should throw error for missing refresh token', async () => {
      await expect(authService.refreshToken({ refreshToken: '' })).rejects.toThrow(AuthError);
      await expect(authService.refreshToken({ refreshToken: '' })).rejects.toThrow('Refresh token is required');
    });

    it('should throw error for invalid refresh token', async () => {
      await expect(authService.refreshToken({ refreshToken: 'invalid_token' })).rejects.toThrow(AuthError);
    });
  });

  describe('logout', () => {
    it('should successfully logout user', async () => {
      (mockPrisma.refreshToken.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await authService.logout({ refreshToken: 'some_token' });

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('Logged out successfully');
    });

    it('should handle logout without refresh token', async () => {
      const result = await authService.logout({});

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('Logged out successfully');
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const mockUser = {
        id: uuidv4(),
        email: 'test@example.com',
        password: 'hashed_password',
        firstName: 'John',
        lastName: 'Doe',
        role: Role.USER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.getProfile(mockUser.id);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('firstName');
      expect(result).toHaveProperty('lastName');
      expect(result).toHaveProperty('fullName');
      expect(result.email).toBe(mockUser.email);
    });

    it('should throw error for non-existent user', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(authService.getProfile('non-existent-id')).rejects.toThrow(AuthError);
      await expect(authService.getProfile('non-existent-id')).rejects.toThrow('User not found');
    });
  });

  describe('updateProfile', () => {
    it('should update user profile successfully', async () => {
      const userId = uuidv4();
      const mockUser = {
        id: userId,
        email: 'updated@example.com',
        password: 'hashed_password',
        firstName: 'Updated',
        lastName: 'Name',
        role: Role.USER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.updateProfile(userId, {
        firstName: 'Updated',
        lastName: 'Name',
        email: 'updated@example.com',
      });

      expect(result.firstName).toBe('Updated');
      expect(result.lastName).toBe('Name');
      expect(result.email).toBe('updated@example.com');
    });

    it('should throw error if email is already in use', async () => {
      const userId = uuidv4();
      const existingUser = {
        id: uuidv4(),
        email: 'existing@example.com',
        password: 'hashed_password',
        firstName: 'Existing',
        lastName: 'User',
        role: Role.USER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser);

      await expect(
        authService.updateProfile(userId, { email: 'existing@example.com' })
      ).rejects.toThrow(AuthError);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const userId = uuidv4();
      const currentPassword = 'Current123!';
      const hashedPassword = await hashPassword(currentPassword);

      const mockUser = {
        id: userId,
        email: 'test@example.com',
        password: hashedPassword,
        firstName: 'John',
        lastName: 'Doe',
        role: Role.USER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        password: await hashPassword('New123!'),
      });
      (mockPrisma.refreshToken.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await authService.changePassword(userId, {
        currentPassword,
        newPassword: 'New123!',
      });

      expect(result).toHaveProperty('message');
      expect(result.message).toContain('Password changed successfully');
    });

    it('should throw error for incorrect current password', async () => {
      const userId = uuidv4();
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        password: await hashPassword('Different123!'),
        firstName: 'John',
        lastName: 'Doe',
        role: Role.USER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        authService.changePassword(userId, {
          currentPassword: 'Wrong123!',
          newPassword: 'New123!',
        })
      ).rejects.toThrow(AuthError);
    });
  });

  describe('verifyToken', () => {
    it('should return invalid for empty token', async () => {
      const result = await authService.verifyToken('');

      expect(result.valid).toBe(false);
      expect(result.message).toBe('Token is required');
    });

    it('should return invalid for invalid token', async () => {
      const result = await authService.verifyToken('invalid_token');

      expect(result.valid).toBe(false);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should clean up expired tokens', async () => {
      (mockPrisma.refreshToken.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });

      const result = await authService.cleanupExpiredTokens();

      expect(result).toBe(5);
    });
  });

  describe('isAdmin', () => {
    it('should return true for admin user', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: Role.ADMIN,
      });

      const result = await authService.isAdmin('admin-id');

      expect(result).toBe(true);
    });

    it('should return false for non-admin user', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        role: Role.USER,
      });

      const result = await authService.isAdmin('user-id');

      expect(result).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await authService.isAdmin('non-existent-id');

      expect(result).toBe(false);
    });
  });
});
