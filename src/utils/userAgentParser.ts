export interface ParsedDeviceInfo {
  browser: string;
  os: string;
  deviceType: 'Desktop' | 'Mobile' | 'Tablet';
  deviceSummary: string;
}

export function parseUserAgent(uaString?: string): ParsedDeviceInfo {
  if (!uaString || typeof uaString !== 'string') {
    return {
      browser: 'Web Browser',
      os: 'Unknown OS',
      deviceType: 'Desktop',
      deviceSummary: 'Web Browser',
    };
  }

  const ua = uaString;

  // 1. Detect OS
  let os = 'Unknown OS';
  let deviceType: 'Desktop' | 'Mobile' | 'Tablet' = 'Desktop';

  if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/iPhone/i.test(ua)) {
    os = 'iOS (iPhone)';
    deviceType = 'Mobile';
  } else if (/iPad/i.test(ua)) {
    os = 'iOS (iPad)';
    deviceType = 'Tablet';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    deviceType = /Tablet|iPad/i.test(ua) ? 'Tablet' : 'Mobile';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  } else if (/CrOS/i.test(ua)) {
    os = 'Chrome OS';
  }

  // 2. Detect Browser
  let browser = 'Web Browser';
  if (/Edg\/|Edge\//i.test(ua)) {
    browser = 'Microsoft Edge';
  } else if (/OPR\/|Opera\//i.test(ua)) {
    browser = 'Opera';
  } else if (/Brave/i.test(ua)) {
    browser = 'Brave';
  } else if (/Chrome\/([0-9]+)/i.test(ua) && !/Chromium/i.test(ua)) {
    const match = ua.match(/Chrome\/([0-9]+)/i);
    browser = match ? `Chrome ${match[1]}` : 'Chrome';
  } else if (/Firefox\/([0-9]+)/i.test(ua)) {
    const match = ua.match(/Firefox\/([0-9]+)/i);
    browser = match ? `Firefox ${match[1]}` : 'Firefox';
  } else if (/Version\/([0-9]+).*Safari/i.test(ua)) {
    const match = ua.match(/Version\/([0-9]+)/i);
    browser = match ? `Safari ${match[1]}` : 'Safari';
  } else if (/Safari/i.test(ua)) {
    browser = 'Safari';
  }

  const deviceSummary = `${browser} on ${os}`;

  return {
    browser,
    os,
    deviceType,
    deviceSummary,
  };
}
