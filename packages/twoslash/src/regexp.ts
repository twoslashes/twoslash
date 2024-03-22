export const reConfigBoolean = /^\/\/\s?@(\w+)$/mg
export const reConfigValue = /^\/\/\s?@(\w+):\s?(.+)$/mg
export const reAnnonateMarkers = /^\s*\/\/\s*\^(\?|\||\^+)( .*)?$/mg

export const reCutBefore = /^\/\/\s?---cut(-before)?---\r?\n/mg
export const reCutAfter = /^\/\/\s?---cut-after---$/mg
export const reCutStart = /^\/\/\s?---cut-start---$/mg
export const reCutEnd = /^\/\/\s?---cut-end---\r?\n/mg
