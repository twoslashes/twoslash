export interface CompilerOptionDeclaration {
  name: string
  type: 'list' | 'boolean' | 'number' | 'string' | Map<string, any>
  element?: CompilerOptionDeclaration
}
