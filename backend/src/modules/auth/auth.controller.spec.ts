import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: jest.fn(),
    validateUser: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    verifyEmail: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 5 }]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('route metadata', () => {
    const getThrottleLimit = (fn: Function) =>
      Reflect.getMetadata('THROTTLER:LIMITdefault', fn);

    it('should have throttle metadata on login route', () => {
      expect(getThrottleLimit(AuthController.prototype.login)).toBeDefined();
    });

    it('should have throttle metadata on register route', () => {
      expect(getThrottleLimit(AuthController.prototype.register)).toBeDefined();
    });

    it('should have throttle metadata on forgot-password route', () => {
      expect(getThrottleLimit(AuthController.prototype.forgotPassword)).toBeDefined();
    });

    it('should have throttle metadata on reset-password route', () => {
      expect(getThrottleLimit(AuthController.prototype.resetPassword)).toBeDefined();
    });
  });
});
