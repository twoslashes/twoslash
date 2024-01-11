import type { Node, SourceFile, TransformationContext, TransformerFactory } from 'typescript'
import { isSourceFile, isStringLiteral, visitEachChild, visitNode } from 'typescript'
import { expect, it } from 'vitest'
import { twoslasher } from '../src/index'
import { FEAT_SHOW_EMIT } from './FEATURES'

it.skipIf(!FEAT_SHOW_EMIT)('applies custom transformers', () => {
  const code = 'console.log(\'Hello World!\')'
  // A simple transformer that uppercases all string literals
  const transformer: TransformerFactory<SourceFile> = (ctx: TransformationContext) => {
    const visitor = (node: Node): Node => {
      if (isStringLiteral(node))
        return ctx.factory.createStringLiteral(node.text.toUpperCase())

      return visitEachChild(node, visitor, ctx)
    }
    return node => visitNode(node, visitor, isSourceFile)
  }

  const result = twoslasher(code, 'ts', {
    handbookOptions: { showEmit: true },
    customTransformers: {
      before: [transformer],
    },
  })
  expect(result.errors).toEqual([])
  expect(result.code).toContain('console.log("HELLO WORLD!")')
})
