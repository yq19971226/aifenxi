/**
 * 返回用户的有效会员等级。
 * 管理员（is_admin=true）视为旗舰级（level 2），可使用所有功能。
 */
export function effectiveLevel(user: { membership_level: number; is_admin?: boolean } | null | undefined): number {
  if (!user) return 0;
  if (user.is_admin) return 2;
  return user.membership_level;
}
