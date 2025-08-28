import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { CRC } from '@johntalton/eefs'

describe('CRC', () => {
	describe('calculate', () => {
		it('should accept empty buffer', () => {
			const ab = new ArrayBuffer(0)
			const crc = CRC.calculate(ab)
			assert.equal(0, crc)
		})

		it('should generate basic', () => {
			const ab = Uint8Array.from([ 0x00, 0x01, 0x02 ])
			const crc = CRC.calculate(ab.buffer)
			assert.equal(0x5180, crc)
		})

		it('should generate from string', () => {
			const encoder = new TextEncoder()
			const ab = encoder.encode('the quick brown fox jumped over the lazy sleeping dog')
			const crc = CRC.calculate(ab)
			assert.equal(0x67E4, crc)
		})

		it('should support initial CRC', () => {
			const encoder = new TextEncoder()
			const first = encoder.encode('the quick brown fox jumped')
			const second = encoder.encode(' over the lazy sleeping dog')
			const firstCRC = CRC.calculate(first)
			const crc = CRC.calculate(second, firstCRC)
			assert.equal(0x67E4, crc)
		})
	})
})