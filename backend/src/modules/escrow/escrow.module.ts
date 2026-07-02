import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '../queues/queues.constants';
import { EscrowService } from './escrow.service';
import { EscrowController } from './escrow.controller';
import { EscrowProcessor } from './escrow.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.ESCROW },
      { name: QUEUE_NAMES.NOTIFICATIONS },
      { name: QUEUE_NAMES.WALLET },
    ),
  ],
  providers: [EscrowService, EscrowProcessor],
  controllers: [EscrowController],
  exports: [EscrowService],
})
export class EscrowModule {}
