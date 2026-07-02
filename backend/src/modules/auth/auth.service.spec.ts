import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  verificationToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('test-access-token'),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    const values: Record<string, string> = {
      JWT_ACCESS_SECRET: 'test-secret',
      JWT_ACCESS_EXPIRES: '15m',
      FRONTEND_URL: 'http://localhost:3000',
    };
    return values[key];
  }),
};

const mockNotificationsQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: 'BullQueue_notifications', useValue: mockNotificationsQueue },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user and return tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'JOB_SEEKER',
      });

      const result = await service.register({
        email: 'test@example.com',
        password: 'StrongPass123!',
        firstName: 'Test',
        lastName: 'User',
      });

      expect(result.accessToken).toBe('test-access-token');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw ConflictException for duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing', email: 'test@example.com' });

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'StrongPass123!',
          firstName: 'Test',
          lastName: 'User',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('validateUser', () => {
    it('should return user for valid credentials', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: '$2a$12$' + 'a'.repeat(53), // valid bcrypt hash format
        isActive: true,
        role: 'JOB_SEEKER',
        firstName: 'Test',
        lastName: 'User',
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);

      const result = await service.validateUser('test@example.com', 'StrongPass123!');
      expect(result.id).toBe('user-1');
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: '$2a$12$' + 'a'.repeat(53),
        isActive: true,
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false);

      await expect(service.validateUser('test@example.com', 'wrong')).rejects.toThrow(UnauthorizedException);
    });
  });
});
