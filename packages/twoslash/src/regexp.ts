export const reConfigBoolean = /^\/\/\s?@(\w+)$/gm
export const reConfigValue = /^\/\/\s?@(\w+):\s?(.+)$/gm
export const reAnnonateMarkers = /^\s*\/\/\s*\^(\?|\||\^+)( .*)?$/gm

export const reCutBefore = /^\/\/\s?---cut(-before)?---$/
export const reCutAfter = /^\/\/\s?---cut-after---$/
export const reCutStart = /^\/\/\s?---cut-start---$/
export const reCutEnd = /^\/\/\s?---cut-end---$/
export const reFilenamesMakers = /^[\t\v\f ]*\/\/\s?@filename: (.+)$/gm
