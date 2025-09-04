import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
	EEFS
} from '@johntalton/eefs'

import {
	MicroEEFS
} from '@johntalton/eefs/micro'

import { commonBeforeEach } from './test-helpers.js'

describe('MicroEEFS', () => {
	let context = {}

	beforeEach(async () => {
		context = await commonBeforeEach(false)
	})

	describe('findFile (uninitialized)', () => {
		it('should throw error on bad MAGIC', async () => {
			const backingU32 = new Uint32Array(context.backingBuffer)
			backingU32[1] = 0xDEAD
			await assert.rejects(async () => {
				await MicroEEFS.findFile(context.options.eeprom, context.baseAddress, 'not_found')
			}, new Error('Invalid Magic'))
		})

		it('should throw error on bad version', async () => {
			const backingU32 = new Uint32Array(context.backingBuffer)
			backingU32[1] = 0x34_12_F5_EE // 0xEEF51234
			backingU32[2] = 0xDEAD
			await assert.rejects(async () => {
				await MicroEEFS.findFile(context.options.eeprom, context.baseAddress, 'not_found')
			}, new Error('Invalid Version'))
		})
	})

	describe('findFile', () => {
		let context = {}

		beforeEach(async () => {
			context = await commonBeforeEach(true, true, true)
		})

		afterEach(async () => {
			await EEFS.freeFS(context.fs)
		})

		it('should not find unknown files', async () => {
			const result = await MicroEEFS.findFile(context.fs.eeprom, context.baseAddress, 'not_found')
			assert.equal(result, undefined)
		})

		it('should find file', async () => {
			const result = await MicroEEFS.findFile(context.options.eeprom, context.baseAddress, 'README.md')
			assert.ok(result instanceof File)
			assert.equal(result.name, 'README.md')
			assert.equal(result.size, 54)
		})

		it('should find readonly file', async () => {
			const result = await MicroEEFS.findFile(context.options.eeprom, context.baseAddress, '🔒.json')
			assert.ok(result instanceof File)
			assert.equal(result.name, '🔒.json')
			assert.equal(result.size, 17)
		})

		it('should find readonly file with custom decoder', async () => {
			const decoder = new TextDecoder('us-ascii', { fatal: false, ignoreBOM: true })
			const result = await MicroEEFS.findFile(context.options.eeprom, context.baseAddress, 'README.md', decoder)
			assert.ok(result instanceof File)
			assert.equal(result.name, 'README.md')
			assert.equal(result.size, 54)
		})
	})
})
