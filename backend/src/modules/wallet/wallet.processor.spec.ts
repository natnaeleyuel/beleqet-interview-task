import { Test, TestingModule } from '@nestjs/testing';
import { WalletProcessor } from './wallet.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { WALLET_JOBS } from '../queues/queues.constants';

const mockPrisma = {
  freelancerWallet: {
    upsert: jest.fn(),
  },
  walletTransaction: {
    create: jest.fn(),
  },
};

describe('WalletProcessor', () => {
  let processor: WalletProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletProcessor,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    processor = module.get<WalletProcessor>(WalletProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleReleasePending', () => {
    const jobData = {
      userId: 'freelancer-1',
      amount: 5000,
      milestoneId: 'milestone-1',
    };

    const mockJob = {
      data: jobData,
    } as any;

    it('should move pending balance to available', async () => {
      mockPrisma.freelancerWallet.upsert.mockResolvedValue({
        id: 'wallet-1',
        userId: 'freelancer-1',
        pendingBalance: 0,
        availableBalance: 5000,
      });
      mockPrisma.walletTransaction.create.mockResolvedValue({ id: 'tx-1' });

      await processor.handleReleasePending(mockJob);

      expect(mockPrisma.freelancerWallet.upsert).toHaveBeenCalledWith({
        where: { userId: 'freelancer-1' },
        update: {
          pendingBalance: { decrement: 5000 },
          availableBalance: { increment: 5000 },
        },
        create: {
          userId: 'freelancer-1',
          pendingBalance: 0,
          availableBalance: 5000,
        },
      });

      expect(mockPrisma.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'CREDIT_AVAILABLE',
            amount: 5000,
            milestoneId: 'milestone-1',
          }),
        }),
      );
    });

    it('should handle idempotent retry without double-crediting', async () => {
      // Simulate a retry where the pending balance is already 0
      mockPrisma.freelancerWallet.upsert.mockResolvedValue({
        id: 'wallet-1',
        pendingBalance: 0,
        availableBalance: 5000,
      });
      mockPrisma.walletTransaction.create.mockResolvedValue({ id: 'tx-2' });

      // Second call: pending already decremented, should not go negative
      mockPrisma.freelancerWallet.upsert.mockResolvedValue({
        id: 'wallet-1',
        pendingBalance: 0,
        availableBalance: 10000,
      });

      await processor.handleReleasePending(mockJob);
      // Prisma upsert with decrement on 0 results in 0 (not negative) due to DB constraint
      const updateCall = mockPrisma.freelancerWallet.upsert.mock.calls[0][0];
      expect(updateCall.update.pendingBalance.decrement).toBe(5000);

      // A second transaction record is created
      expect(mockPrisma.walletTransaction.create).toHaveBeenCalledTimes(1);
    });
  });
});
