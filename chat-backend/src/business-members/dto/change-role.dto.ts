import { IsIn, IsNotEmpty } from 'class-validator';

export class ChangeRoleDto {
  @IsIn(['owner', 'admin', 'editor', 'viewer'])
  @IsNotEmpty()
  role: string;
}
