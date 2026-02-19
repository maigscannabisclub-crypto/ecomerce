import { Role } from '../../domain/entities/User';

// ============================================
// Request DTOs
// ============================================

/**
 * Register User Request DTO
 */
export interface RegisterUserRequestDTO {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/**
 * Login User Request DTO
 */
export interface LoginUserRequestDTO {
  email: string;
  password: string;
}

/**
 * Refresh Token Request DTO
 */
export interface RefreshTokenRequestDTO {
  refreshToken: string;
}

/**
 * Logout User Request DTO
 */
export interface LogoutUserRequestDTO {
  refreshToken?: string;
}

/**
 * Update Profile Request DTO
 */
export interface UpdateProfileRequestDTO {
  firstName?: string;
  lastName?: string;
  email?: string;
}

/**
 * Change Password Request DTO
 */
export interface ChangePasswordRequestDTO {
  currentPassword: string;
  newPassword: string;
}

// ============================================
// Response DTOs
// ============================================

/**
 * User Profile Response DTO
 */
export interface UserProfileResponseDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Token Pair Response DTO
 */
export interface TokenPairResponseDTO {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  tokenType: string;
}

/**
 * Login Response DTO
 */
export interface LoginResponseDTO {
  user: UserProfileResponseDTO;
  tokens: TokenPairResponseDTO;
}

/**
 * Register Response DTO
 */
export interface RegisterResponseDTO {
  user: UserProfileResponseDTO;
  tokens: TokenPairResponseDTO;
  message: string;
}

/**
 * Refresh Token Response DTO
 */
export interface RefreshTokenResponseDTO {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * Logout Response DTO
 */
export interface LogoutResponseDTO {
  message: string;
}

/**
 * Verify Token Response DTO
 */
export interface VerifyTokenResponseDTO {
  valid: boolean;
  user?: {
    userId: string;
    email: string;
    role: Role;
  };
  message?: string;
}

// ============================================
// Internal DTOs
// ============================================

/**
 * Token Payload DTO
 */
export interface TokenPayloadDTO {
  userId: string;
  email: string;
  role: Role;
}

/**
 * User Session DTO
 */
export interface UserSessionDTO {
  userId: string;
  email: string;
  role: Role;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

// ============================================
// Error DTOs
// ============================================

/**
 * Authentication Error DTO
 */
export interface AuthErrorDTO {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

/**
 * Validation Error DTO
 */
export interface ValidationErrorDTO {
  field: string;
  message: string;
  value?: unknown;
}

// ============================================
// Mapper Functions
// ============================================

/**
 * Map user entity to profile response DTO
 */
export const mapUserToProfileDTO = (
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }
): UserProfileResponseDTO => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: `${user.firstName} ${user.lastName}`,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

/**
 * Map token pair to response DTO
 */
export const mapTokenPairToDTO = (
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number
): TokenPairResponseDTO => ({
  accessToken,
  refreshToken,
  expiresIn: expiresInSeconds,
  tokenType: 'Bearer',
});
