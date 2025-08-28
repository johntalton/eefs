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
			assert.rejects(async () => {
				await MicroEEFS.findFile(context.fs.eeprom, context.baseAddress, 'not_found', context.fs.decoder)
			})
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
			const result = await MicroEEFS.findFile(context.fs.eeprom, context.baseAddress, 'not_found', context.fs.decoder)
			assert.equal(result, undefined)
		})

		it('should find file', async () => {
			const result = await MicroEEFS.findFile(context.fs.eeprom, context.baseAddress, 'README.md', context.fs.decoder)
			assert.ok(result instanceof File)
			assert.equal(result.name, 'README.md')
			assert.equal(result.size, 54)
		})

		it('should find readonly file', async () => {
			const result = await MicroEEFS.findFile(context.fs.eeprom, context.baseAddress, '🔒.json', context.fs.decoder)
			assert.ok(result instanceof File)
			assert.equal(result.name, '🔒.json')
			assert.equal(result.size, 17)
		})
	})
})
