import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GT06ParserService } from './gt06-parser.service';
import { TcpServerService } from './tcp-server.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [GT06ParserService, TcpServerService],
  exports: [GT06ParserService, TcpServerService],
})
export class GpsIngestModule {}
