export const reConfigBoolean = /^\/\/\s?@(\w+)$/mg
export const reConfigValue = /^\/\/\s?@(\w+):\s?(.+)$/mg
export const reAnnonateMarkers = /^\s*\/\/\s*\^(\?|\||\^+)( .*)?$/mg

export const reCutBefore = /^[\t\v\f ]*\/\/\s?---cut(-before)?---\r?\n/mg
export const reCutAfter = /^[\t\v\f ]*\/\/\s?---cut-after---$/mg
export const reCutStart = /^[\t\v\f ]*\/\/\s?---cut-start---$/mg
export const reCutEnd = /^[\t\v\f ]*\/\/\s?---cut-end---\r?\n/mg
export const reFilenamesMakers = /^[\t\v\f ]*\/\/\s?@filename: (.+)$/mg
