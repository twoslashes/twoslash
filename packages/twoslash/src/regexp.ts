export const reConfigBoolean = /^\/\/\s?@(\w+)$/gm
export const reConfigValue = /^\/\/\s?@(\w+):\s?(.+)$/gm
export const reAnnonateMarkers = /^\s*\/\/\s*\^(\?|\||\^+)( .*)?$/gm

export const reCutBefore = /^[\t\v\f ]*\/\/\s?---cut(-before)?---\r?\n/gm
export const reCutAfter = /^[\t\v\f ]*\/\/\s?---cut-after---$/gm
export const reCutStart = /^[\t\v\f ]*\/\/\s?---cut-start---$/gm
export const reCutEnd = /^[\t\v\f ]*\/\/\s?---cut-end---\r?\n/gm
export const reFilenamesMakers = /^[\t\v\f ]*\/\/\s?@filename: (.+)$/gm
