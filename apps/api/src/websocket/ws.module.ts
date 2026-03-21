import { Module, Global } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { AuthModule } from '../auth';

@Global()
@Module({
  imports: [AuthModule],
  providers: [WsGateway],
  exports: [WsGateway],
})
export class WsModule {}
