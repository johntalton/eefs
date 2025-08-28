import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
	EEFS_FREAD, EEFS_FWRITE, EEFS_FCREAT,
	O_ACCMODE,
	O_RDONLY,
	O_WRONLY,
	O_RDWR,
	O_CREAT,
	O_TRUNC
} from '@johntalton/eefs'
import { modeFromFlags, range, roundUp, stripZeroU8 } from '../src/utils.js'

describe('Util', () => {
	describe('range', () => {
		it('should provide iterator', () => {
			const iter = range(0, 1)
			assert.equal('function', typeof iter[Symbol.iterator])
		})

		it('should iterate none', () => {
			const result = [ ...range(0, -1) ]
			assert.deepStrictEqual([  ], result)
		})

		it('should iterate single', () => {
			const result = [ ...range(0, 0) ]
			assert.deepStrictEqual([ 0 ], result)
		})

		it('should iterate range inclusive', () => {
			const result = [ ...range(0, 3) ]
			assert.deepStrictEqual([ 0, 1, 2, 3 ], result)
		})

		it('should iterate large range', () => {
			const result = [ ...range(0, 1_000_000) ]
			assert.equal(1_000_000 + 1, result.length)
		})

		it('should iterate very large range', { skip: 'slow' } , () => {
			let count = 0
			for(const i of range(0, 1_000_000_000)) {
				count += 1
			}
			assert.equal(1_000_000_000 + 1, count)
		})
	})

	describe('roundUp', () => {
		it('should handle zero', () => {
			const result = roundUp(0, 4)
			assert.equal(0, result)
		})

		it('should return already aligned value', () => {
			const result = roundUp(40, 4)
			assert.equal(40, result)
		})

		it('should return align smaller values', () => {
			const result = roundUp(39, 4)
			assert.equal(40, result)
		})

		it('should return aligned larger values', () => {
			const result = roundUp(41, 4)
			assert.equal(44, result)
		})
	})

	describe('modeFromFlags', () => {
		it('should throw on undefined', () => {
			assert.throws(() => {
				modeFromFlags(undefined)
			}, TypeError)
		})

		it('should result in Zero for Zero', () => {
			const result = modeFromFlags(0)
			assert.equal(0, result)
		})

		it('should result in Zero for values outsize AccessMode Mask sans O_CREAT|O_TRUNC', () => {
			const result = modeFromFlags(~(O_ACCMODE|O_CREAT|O_TRUNC))
			assert.equal(0, result)
		})

		it('should result in FREAD if RDONLY', () => {
			const result = modeFromFlags(O_RDONLY)
			assert.equal(EEFS_FREAD, result)
		})

		it('should result in FWRITE if WRONLY', () => {
			const result = modeFromFlags(O_WRONLY)
			assert.equal(EEFS_FWRITE, result)
		})

		it('should result in FREAD|FWRITE if RDWR', () => {
			const result = modeFromFlags(O_RDWR)
			assert.equal(EEFS_FREAD|EEFS_FWRITE, result)
		})

		it('should result in FREAD|FWRITE|CREATE if RDWR|CREATE', () => {
			const result = modeFromFlags(O_RDWR|O_CREAT)
			assert.equal(EEFS_FREAD|EEFS_FWRITE|EEFS_FCREAT, result)
		})

		it('should ignore O_TRUNC', () => {
			const result = modeFromFlags(O_RDWR|O_TRUNC)
			assert.equal(EEFS_FREAD|EEFS_FWRITE, result)
		})
	})

	describe('stripZeroU8', () => {
		it('should throw on undefined', () => {
			assert.throws(() => {
				stripZeroU8(undefined)
			}, TypeError)
		})

		it('should throw on ArrayBuffer', () => {
			const ab = new ArrayBuffer(1)

			assert.throws(() => {
				stripZeroU8(ab)
			}, TypeError)
		})

		it('should throw on non-u8', () => {
			const u16 = new Uint16Array(1)

			assert.throws(() => {
				stripZeroU8(u16)
			}, TypeError)
		})

		it('should handle empty buffer', () => {
			const u8 = Uint8Array.from([ ])
			const result = stripZeroU8(u8)
			assert.equal(0, result.byteLength)
		})

		it('should return empty if all zeros', () => {
			const u8 = Uint8Array.from([ 0,0,0,0 ])
			const result = stripZeroU8(u8)
			assert.equal(0, result.byteLength)
		})

		it('should return identity if no Zeros found', () => {
			const u8 = Uint8Array.from([ 1,2,3,4 ])
			const result = stripZeroU8(u8)
			assert.equal(4, result.byteLength)
		})

		it('should strip trailing zeros', () => {
			const u8 = Uint8Array.from([ 1,2,3,4, 0,0,0 ])
			const result = stripZeroU8(u8)
			assert.equal(4, result.byteLength)
		})

		it('should not strip leading zeros', () => {
			const u8 = Uint8Array.from([ 0,0,0, 1,2,3,4])
			const result = stripZeroU8(u8)
			assert.equal(7, result.byteLength)
		})

		it('should not strip inner-zeros', () => {
			const u8 = Uint8Array.from([ 1,0,0,4, 0,0,0 ])
			const result = stripZeroU8(u8)
			assert.equal(4, result.byteLength)
		})
	})
})
