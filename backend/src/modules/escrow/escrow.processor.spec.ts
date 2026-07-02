import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EscrowProcessor } from './escrow.processor';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma: Record<string, any> = {
  escrowTransaction: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  freelanceJob: {
    update: jest.fn(),
  },
  eventLog: {
    create: jest.fn(),
  },
  freelancerWallet: {
    upsert: jest.fn(),
  },
  walletTransaction: {
    create: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};
mockPrisma.$transaction = jest.fn((args: any) => Promise.all(args));

const mockConfig = {
  get: jest.fn((key: string) => {
    const values: Record<string, string> = {
      FRONTEND_URL: 'http://localhost:3000',
      CHAPA_SECRET_KEY: 'test-key',
    };
    return values[key];
  }),
};

const mockNotificationsQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

const mockWalletQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

const mockEscrowQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

describe('EscrowProcessor', () => {
  let processor: EscrowProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscrowProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: 'BullQueue_notifications', useValue: mockNotificationsQueue },
        { provide: 'BullQueue_wallet', useValue: mockWalletQueue },
        { provide: 'BullQueue_escrow', useValue: mockEscrowQueue },
      ],
    }).compile();

    processor = module.get<EscrowProcessor>(EscrowProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleWebhook', () => {
    const validPayload = {
      reference: 'chapa-ref-123',
      status: 'success',
      tx_ref: 'escrow-tx-id',
    };

    it('should mark escrow as funded on success status', async () => {
      mockPrisma.escrowTransaction.findFirst.mockResolvedValue({
        id: 'escrow-1',
        status: 'PENDING',
        freelanceJobId: 'gig-1',
        grossAmount: 10000,
        freelanceJob: { clientId: 'client-1' },
      });

      mockPrisma.$transaction.mockImplementation(async (args: any) => Promise.all(args));

      await processor.handleWebhook({ data: validPayload } as any);

      expect(mockPrisma.escrowTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'escrow-1' },
          data: expect.objectContaining({ status: 'FUNDED' }),
        }),
      );
    });

    it('should skip idempotently if escrow already funded', async () => {
      mockPrisma.escrowTransaction.findFirst.mockResolvedValue({
        id: 'escrow-1',
        status: 'FUNDED',
        freelanceJob: { clientId: 'client-1' },
      });

      await processor.handleWebhook({ data: validPayload } as any);

      expect(mockPrisma.escrowTransaction.update).not.toHaveBeenCalled();
    });

    it('should not crash on unknown escrow reference', async () => {
      mockPrisma.escrowTransaction.findFirst.mockResolvedValue(null);

      await expect(
        processor.handleWebhook({ data: { reference: 'unknown' } } as any),
      ).resolves.not.toThrow();
    });
  });

  describe('handleAutoRelease', () => {
    const jobData = {
      milestoneId: 'milestone-1',
      freelancerId: 'freelancer-1',
      amount: 5000,
      releaseAt: new Date(Date.now() - 10000).toISOString(), // already elapsed
    };

    it('should enqueue wallet release after hold period', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await processor.handleAutoRelease({ data: jobData } as any);

      expect(mockWalletQueue.add).toHaveBeenCalledWith(
        'release-pending',
        {
          userId: 'freelancer-1',
          amount: 5000,
          milestoneId: 'milestone-1',
        },
      );
    });

    it('should re-queue with delay if hold period not elapsed', async () => {
      const futureData = {
        ...jobData,
        releaseAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour in future
      };

      await processor.handleAutoRelease({ data: futureData } as any);

      expect(mockEscrowQueue.add).toHaveBeenCalled();
      expect(mockWalletQueue.add).not.toHaveBeenCalled();
    });
  });
});
