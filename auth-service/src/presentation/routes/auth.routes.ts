import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';
import {
  validateBody,
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  updateProfileSchema,
  changePasswordSchema,
} from '../middleware/validation';

/**
 * Create auth routes
 */
const createAuthRoutes = (): Router => {
  const router = Router();
  const authController = new AuthController();

  // ============================================
  // Public Routes
  // ============================================

  /**
   * @route   POST /auth/register
   * @desc    Register a new user
   * @access  Public
   */
  router.post(
    '/register',
    validateBody(registerSchema),
    authController.register
  );

  /**
   * @route   POST /auth/login
   * @desc    Login user
   * @access  Public
   */
  router.post(
    '/login',
    validateBody(loginSchema),
    authController.login
  );

  /**
   * @route   POST /auth/refresh
   * @desc    Refresh access token
   * @access  Public
   */
  router.post(
    '/refresh',
    validateBody(refreshTokenSchema),
    authController.refreshToken
  );

  /**
   * @route   POST /auth/logout
   * @desc    Logout user
   * @access  Public
   */
  router.post(
    '/logout',
    validateBody(logoutSchema),
    authController.logout
  );

  /**
   * @route   GET /auth/verify
   * @desc    Verify access token (for other services)
   * @access  Public
   */
  router.get('/verify', authController.verifyToken);

  // ============================================
  // Protected Routes
  // ============================================

  /**
   * @route   GET /auth/profile
   * @desc    Get user profile
   * @access  Private
   */
  router.get(
    '/profile',
    authenticate,
    authController.getProfile
  );

  /**
   * @route   PUT /auth/profile
   * @desc    Update user profile
   * @access  Private
   */
  router.put(
    '/profile',
    authenticate,
    validateBody(updateProfileSchema),
    authController.updateProfile
  );

  /**
   * @route   PUT /auth/change-password
   * @desc    Change user password
   * @access  Private
   */
  router.put(
    '/change-password',
    authenticate,
    validateBody(changePasswordSchema),
    authController.changePassword
  );

  /**
   * @route   POST /auth/logout-all
   * @desc    Logout from all devices
   * @access  Private
   */
  router.post(
    '/logout-all',
    authenticate,
    authController.logoutAll
  );

  return router;
};

export default createAuthRoutes;
