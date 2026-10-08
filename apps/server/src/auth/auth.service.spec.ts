import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthService (Phase 6 Security & Authentication Audit)', () => {
  let authService: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('should sign up a new user with hashed password and lowercased email', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);
    mockPrismaService.user.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'user-uuid-1',
        email: data.email,
        passwordHash: data.passwordHash,
        displayName: data.displayName,
      })
    );

    const result = await authService.signup({
      email: 'Test@Example.com',
      password: 'password123',
      displayName: 'Alice',
    });

    expect(result.token).toBe('mock-jwt-token');
    expect(result.user.email).toBe('test@example.com');
    expect(result.user.displayName).toBe('Alice');
    expect(mockPrismaService.user.create).toHaveBeenCalled();
  });

  it('should throw ConflictException if user email already exists', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 'existing-id' });

    await expect(
      authService.signup({
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Alice',
      })
    ).rejects.toThrow(ConflictException);
  });

  it('should login user with correct credentials', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-uuid-1',
      email: 'test@example.com',
      passwordHash: hashedPassword,
      displayName: 'Alice',
    });

    const result = await authService.login({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.token).toBe('mock-jwt-token');
    expect(result.user.email).toBe('test@example.com');
  });

  it('should throw generic UnauthorizedException on non-existent user (no user enumeration)', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    await expect(
      authService.login({
        email: 'nonexistent@example.com',
        password: 'password123',
      })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw generic UnauthorizedException on wrong password', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-uuid-1',
      email: 'test@example.com',
      passwordHash: hashedPassword,
      displayName: 'Alice',
    });

    await expect(
      authService.login({
        email: 'test@example.com',
        password: 'wrongpassword',
      })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should verify valid JWT and return payload', () => {
    mockJwtService.verify.mockReturnValue({ sub: 'user-uuid-1', email: 'test@example.com' });
    const payload = authService.verifyJwt('valid-token');
    expect(payload).toEqual({ sub: 'user-uuid-1', email: 'test@example.com' });
  });

  it('should return null for invalid or expired JWT', () => {
    mockJwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const payload = authService.verifyJwt('expired-token');
    expect(payload).toBeNull();
  });
});
