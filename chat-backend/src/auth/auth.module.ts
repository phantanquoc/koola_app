import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { User, UserSchema } from '../users/user.schema';
import { RefreshToken, RefreshTokenSchema } from './refresh-token.schema';
import {
  BusinessSession,
  BusinessSessionSchema,
} from '../business-members/schemas/business-session.schema';
import { UsersModule } from '../users/users.module';
import { EmailService } from './email.service';
import type { StringValue } from 'ms';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_ACCESS_EXPIRY') ||
            '1h') as StringValue,
        },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      // Task 8.9: logout releases the actor's business device sessions. The
      // schema (not BusinessMembersModule) is registered here deliberately —
      // see the note on AuthService's constructor.
      { name: BusinessSession.name, schema: BusinessSessionSchema },
    ]),
    forwardRef(() => UsersModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, EmailService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
