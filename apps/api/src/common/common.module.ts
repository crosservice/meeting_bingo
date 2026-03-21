import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AuditService } from './audit.service';
import { SecurityHeadersMiddleware } from './security-headers.middleware';

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}
