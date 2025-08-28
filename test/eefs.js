import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
	EEFS,
	EEFS_NO_SUCH_DEVICE,
	EEFS_SUCCESS,
	O_RDONLY,
	O_CREAT,
	EEFS_DEVICE_IS_BUSY,
	EEFS_INVALID_ARGUMENT,
	EEFS_PERMISSION_DENIED,
	EEFS_FILE_NOT_FOUND
} from '@johntalton/eefs'
import { EEPROMArrayBuffer } from '@johntalton/eefs/eeprom-array-buffer'

import { commonBeforeEach, DEFAULT_BASE_ADDRESS, DEFAULT_FS, DEFAULT_HELPERS } from './test-helpers.js'

describe('EEFS (no context)', () => {
	it('requires minimum eeprom size', async () => {
		const size = 8
		const backingBuffer = new ArrayBuffer(size)

		const fs =  {
			eeprom: new EEPROMArrayBuffer(backingBuffer),
			...structuredClone(DEFAULT_FS),
			...DEFAULT_HELPERS
		}

		// can not format under size
		// format(fs.eeprom, DEFAULT_BASE_ADDRESS, size)

		await assert.rejects(async () => {
			await EEFS.initFS(fs, DEFAULT_BASE_ADDRESS)
		})
	})
})

describe('EEFS (unformatted)', () => {
	let context = {}

	beforeEach(async () => {
		context = await commonBeforeEach(false, false)
	})

	it('should fail unformatted inits', async () => {
		const status = await EEFS.initFS(context.fs, DEFAULT_BASE_ADDRESS)
		assert.equal(status, EEFS_NO_SUCH_DEVICE)
	})
})

describe('EEFS (formatted)', () => {
	let context = {}

	beforeEach(async () => {
		context = await commonBeforeEach(true, false)
	})

	it('should not init if bad version', async () => {
		const backingU32 = new Uint32Array(context.backingBuffer)
		backingU32[2] = 42 // version is at offset 2

		const status = await EEFS.initFS(context.fs, DEFAULT_BASE_ADDRESS)
		assert.equal(status, EEFS_NO_SUCH_DEVICE)
	})

	it('should not init if max files', async () => {
		const backingU32 = new Uint32Array(context.backingBuffer)
		backingU32[5] = 0xFFFF // numberOfFiles is at offset 5

		const status = await EEFS.initFS(context.fs, DEFAULT_BASE_ADDRESS)
		assert.equal(status, EEFS_NO_SUCH_DEVICE)
	})

	it('should init', async () => {
		const status = await EEFS.initFS(context.fs, DEFAULT_BASE_ADDRESS)
		assert.equal(status, EEFS_SUCCESS)
		assert.equal(context.fs.inodeTable.baseAddress, DEFAULT_BASE_ADDRESS)
	})
})

describe('EEFS (initialized)', () => {
	let context = {}

	beforeEach(async () => {
		context = await commonBeforeEach(true, true)
	})

	it('should de-inits', async () => {
		const status = await EEFS.freeFS(context.fs)
		assert.equal(status, EEFS_SUCCESS)
	})

	it('should not de-init if open files', async () => {
		context.fs.fileDescriptorTable[0] = {
			inUse: true,
			inodeTable: context.fs.inodeTable
		}

		const status = await EEFS.freeFS(context.fs)
		assert.equal(status, EEFS_DEVICE_IS_BUSY)
	})

})

describe('EEFS (empty)', () => {
	let context = {}

	beforeEach(async () => {
		context = await commonBeforeEach(true, true)
	})

	afterEach(async () => {
		const status = await EEFS.freeFS(context.fs)
		assert.equal(status, EEFS_SUCCESS)
	})

	it('should disallow undefined filename', async () => {
		const fd = await EEFS.open(context.fs, undefined, O_CREAT)
		assert.equal(fd, EEFS_INVALID_ARGUMENT)
	})

	it('should disallow non string filename', async () => {
		const fd = await EEFS.open(context.fs, true, O_CREAT)
		assert.equal(fd, EEFS_INVALID_ARGUMENT)
	})

	it('should disallow empty filename', async () => {
		const fd = await EEFS.open(context.fs, '', O_CREAT)
		assert.equal(fd, EEFS_INVALID_ARGUMENT)
	})

	it('should not open nonexistent files', async () => {
		const fd = await EEFS.open(context.fs, '404', O_RDONLY)
		assert.equal(fd, EEFS_FILE_NOT_FOUND)
	})

	it('should create open with flag', async () => {
		const fd = await EEFS.open(context.fs, 'test1.tmp', O_CREAT)
		assert.ok(fd >= 0)

		await EEFS.close(context.fs, fd)
	})

	it('should create', async () => {
		const fd = await EEFS.create(context.fs, 'test.tmp')
		assert.ok(fd >= 0)

		await EEFS.close(context.fs, fd)
	})

	it('should prevent second create', async () => {
		const fd = await EEFS.create(context.fs, 'test1.tmp')
		assert.ok(fd >= 0)

		const status = await EEFS.create(context.fs, 'test2.tmp')
		assert.equal(status, EEFS_PERMISSION_DENIED)

		await EEFS.close(context.fs, fd)
	})

	it('should prevent unknown attributes ', async () => {
		const fd = await EEFS.create(context.fs, 'test.tmp', 42)
		assert.equal(fd, EEFS_INVALID_ARGUMENT)
	})

	it('should error on closing invalid fd', async () => {
		const status = await EEFS.close(context.fd, 42)
		assert.equal(status, EEFS_INVALID_ARGUMENT)
	})

	it('should return true when has files open', async () => {
		const fd = await EEFS.create(context.fs, 'test.tmp')
		const has = EEFS.hasOpenFiles(context.fs)
		assert.ok(has)
		await EEFS.close(context.fs, fd)
	})
})

describe('EEFS (with files)', () => {
	let context = {}

	beforeEach(async () => {
		context = await commonBeforeEach(true, true, true)
	})

	afterEach(async () => {
		const status = await EEFS.freeFS(context.fs)
		assert.equal(status, EEFS_SUCCESS)
	})

	it('should have files', async () => {
		assert.equal(context.fs.inodeTable.numberOfFiles, 3)
	})

	it('should list files', async () => {
		const list = EEFS.listInodes(context.fs)
		const first = await list.next()
		assert.ok(!first.done)
		assert.notEqual(first.value, undefined)
		assert.equal(first.value.filename, 'README.md')

		const second = await list.next()
		assert.ok(!second.done)
		assert.notEqual(second.value, undefined)
		assert.equal(second.value.filename, 'empty')

		const third = await list.next()
		assert.ok(!third.done)
		assert.notEqual(third.value, undefined)
		assert.equal(third.value.filename, '🔒.json')

		const last = await list.next()
		assert.ok(last.done)
		assert.equal(last.value, undefined)
	})
})

describe('EEFS (full)', () => {
	let context = {}

	beforeEach(async () => {
		context = await commonBeforeEach(true, true, true, true)
	})

	afterEach(async () => {
		const status = await EEFS.freeFS(context.fs)
		assert.equal(status, EEFS_SUCCESS)
	})

	it('should have represent a full device', () => {
		assert.equal(context.fs.inodeTable.files.length, 6)
		assert.equal(context.fs.inodeTable.numberOfFiles, 6)
		assert.equal(context.fs.inodeTable.freeMemorySize, 0)
	})

	it('should have spam-0 with stats', async () => {
		const stat = {}
		const status = await EEFS.stat(context.fs, 'spam-0', stat)
		assert.equal(status, EEFS_SUCCESS)

		assert.equal(stat.filename, 'spam-0')
		assert.equal(stat.fileSize, 61)
		assert.equal(stat.inodeIndex, 3)
	})

	it('should have spam-2 with stats', async () => {
		const stat = {}
		const status = await EEFS.stat(context.fs, 'spam-2', stat)
		assert.equal(status, EEFS_SUCCESS)

		assert.equal(stat.filename, 'spam-2')
		assert.equal(stat.fileSize, 61)
		assert.equal(stat.inodeIndex, 5)
	})

	it('should not have spam-3', async () => {
		const stat = {}
		const status = await EEFS.stat(context.fs, 'spam-3', stat)
		assert.equal(status, EEFS_FILE_NOT_FOUND)
	})
})

