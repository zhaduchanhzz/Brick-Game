export type Locale = 'vi' | 'en' | 'zh-CN';

const messages: Record<string, Record<Locale, string>> = {
  BODY_TOO_LARGE: { vi: 'Dữ liệu gửi lên quá lớn.', en: 'Request body is too large.', 'zh-CN': '请求内容过大。' },
  INTERNAL_ERROR: { vi: 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.', en: 'A server error occurred. Please try again.', 'zh-CN': '服务器发生错误，请重试。' },
  INVALID_CLAIM: { vi: 'Yêu cầu ghi danh không hợp lệ.', en: 'Invalid leaderboard claim.', 'zh-CN': '排行榜登记请求无效。' },
  INVALID_GAME_ID: { vi: 'Trò chơi không hợp lệ.', en: 'Invalid game.', 'zh-CN': '游戏无效。' },
  INVALID_JSON: { vi: 'Dữ liệu JSON không hợp lệ.', en: 'Invalid JSON data.', 'zh-CN': 'JSON 数据无效。' },
  INVALID_NICKNAME: { vi: 'Tên người chơi phải dài 2–20 ký tự và không chứa ký tự đặc biệt.', en: 'Player name must be 2–20 characters without unsupported symbols.', 'zh-CN': '玩家名称须为 2–20 个字符，且不能包含不支持的符号。' },
  INVALID_ORIGIN: { vi: 'Nguồn gửi yêu cầu không được phép.', en: 'Request origin is not allowed.', 'zh-CN': '不允许此请求来源。' },
  INVALID_QUERY: { vi: 'Tham số truy vấn không hợp lệ.', en: 'Invalid query parameters.', 'zh-CN': '查询参数无效。' },
  INVALID_REPLAY: { vi: 'Không thể xác minh ván chơi.', en: 'The game replay could not be verified.', 'zh-CN': '无法验证游戏回放。' },
  INVALID_REPLAY_SCHEMA: { vi: 'Dữ liệu ván chơi không hợp lệ.', en: 'Invalid game replay data.', 'zh-CN': '游戏回放数据无效。' },
  INVALID_RUN: { vi: 'Thiết lập ván chơi không hợp lệ.', en: 'Invalid game settings.', 'zh-CN': '游戏设置无效。' },
  INVALID_RUN_ID: { vi: 'Mã ván chơi không hợp lệ.', en: 'Invalid game session ID.', 'zh-CN': '游戏会话 ID 无效。' },
  INVALID_RUN_STATE: { vi: 'Trạng thái ván chơi không hợp lệ.', en: 'Invalid game session state.', 'zh-CN': '游戏会话状态无效。' },
  JSON_REQUIRED: { vi: 'Yêu cầu phải chứa dữ liệu JSON.', en: 'JSON data is required.', 'zh-CN': '请求必须包含 JSON 数据。' },
  METHOD_NOT_ALLOWED: { vi: 'Phương thức yêu cầu không được hỗ trợ.', en: 'Request method is not allowed.', 'zh-CN': '不允许此请求方法。' },
  NOT_ELIGIBLE: { vi: 'Điểm này không đủ điều kiện vào Top 10.', en: 'This score does not qualify for the Top 10.', 'zh-CN': '该分数未达到前十名资格。' },
  NOT_FOUND: { vi: 'Không tìm thấy nội dung yêu cầu.', en: 'The requested resource was not found.', 'zh-CN': '未找到请求的资源。' },
  RANKED_UNAVAILABLE: { vi: 'Chế độ xếp hạng hiện không khả dụng.', en: 'Ranked mode is currently unavailable.', 'zh-CN': '排名模式暂不可用。' },
  RATE_LIMITED: { vi: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.', en: 'Too many requests. Please try again later.', 'zh-CN': '请求过于频繁，请稍后重试。' },
  RULES_VERSION_UNAVAILABLE: { vi: 'Phiên bản luật chơi này không còn được hỗ trợ.', en: 'This game rules version is no longer supported.', 'zh-CN': '此游戏规则版本已不再受支持。' },
  RUN_EXPIRED: { vi: 'Ván chơi đã hết thời gian xác minh.', en: 'The game session has expired.', 'zh-CN': '游戏会话已过期。' },
  RUN_NOT_FOUND: { vi: 'Không tìm thấy ván chơi.', en: 'Game session not found.', 'zh-CN': '未找到游戏会话。' },
  RUN_OWNER_MISMATCH: { vi: 'Ván chơi này thuộc người chơi khác.', en: 'This game session belongs to another player.', 'zh-CN': '此游戏会话属于其他玩家。' },
  TOO_MANY_WEBSOCKETS: { vi: 'Có quá nhiều kết nối đang mở.', en: 'Too many open connections.', 'zh-CN': '打开的连接过多。' },
  TURNSTILE_FAILED: { vi: 'Xác minh bảo mật thất bại.', en: 'Security verification failed.', 'zh-CN': '安全验证失败。' },
  TURNSTILE_REQUIRED: { vi: 'Cần hoàn thành xác minh bảo mật.', en: 'Security verification is required.', 'zh-CN': '需要完成安全验证。' },
  TURNSTILE_UNAVAILABLE: { vi: 'Dịch vụ xác minh bảo mật hiện không khả dụng.', en: 'Security verification is currently unavailable.', 'zh-CN': '安全验证服务暂不可用。' },
  VISITOR_REQUIRED: { vi: 'Không tìm thấy phiên người chơi.', en: 'Player session is required.', 'zh-CN': '需要玩家会话。' },
  WEBSOCKET_REQUIRED: { vi: 'Cần kết nối WebSocket.', en: 'A WebSocket connection is required.', 'zh-CN': '需要 WebSocket 连接。' },
  WEBSOCKET_UNAVAILABLE: { vi: 'Cập nhật trực tiếp hiện không khả dụng.', en: 'Live updates are currently unavailable.', 'zh-CN': '实时更新暂不可用。' },
};

function languageTag(tag: string): Locale | null {
  const normalized = tag.trim().toLowerCase();
  if (normalized === 'vi' || normalized.startsWith('vi-')) return 'vi';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'zh-hans' || normalized.startsWith('zh-hans-')) return 'zh-CN';
  return null;
}

export function requestLocale(request?: Request): Locale {
  if (!request) return 'vi';
  const explicit = request.headers.get('X-Game-Locale');
  if (explicit) return languageTag(explicit) || 'vi';
  const accepted = (request.headers.get('Accept-Language') || '').slice(0, 256);
  const preferences = accepted.split(',').map((part, index) => {
    const match = /^\s*([a-z0-9*-]+)(?:\s*;\s*q\s*=\s*(\d+(?:\.\d+)?))?\s*$/i.exec(part);
    const weight = match?.[2] === undefined ? 1 : Number(match[2]);
    return { tag: match?.[1] || '', weight: match && Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0, index };
  }).sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const preference of preferences) {
    if (preference.weight === 0) continue;
    const locale = languageTag(preference.tag);
    if (locale) return locale;
  }
  return 'vi';
}

export function errorMessage(code: string, locale: Locale): string {
  return (messages[code] || messages.INTERNAL_ERROR)[locale];
}
