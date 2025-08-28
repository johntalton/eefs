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
		assert.equal(EEFS_NO_SUCH_DEVICE, status)
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
		assert.equal(EEFS_NO_SUCH_DEVICE, status)
	})

	it('should not init if max files', async () => {
		const backingU32 = new Uint32Array(context.backingBuffer)
		backingU32[5] = 0xFFFF // numberOfFiles is at offset 5

		const status = await EEFS.initFS(context.fs, DEFAULT_BASE_ADDRESS)
		assert.equal(EEFS_NO_SUCH_DEVICE, status)
	})

	it('should init', async () => {
		const status = await EEFS.initFS(context.fs, DEFAULT_BASE_ADDRESS)
		assert.equal(EEFS_SUCCESS, status)
		assert.equal(DEFAULT_BASE_ADDRESS, context.fs.inodeTable.baseAddress)
	})
})

describe('EEFS (initialized)', () => {
	let context = {}

	beforeEach(async () => {
		context = await commonBeforeEach(true, true)
	})

	it('should de-inits', async () => {
		const status = await EEFS.freeFS(context.fs)
		assert.equal(EEFS_SUCCESS, status)
	})

	it('should not de-init if open files', async () => {
		context.fs.fileDescriptorTable[0] = {
			inUse: true,
			inodeTable: context.fs.inodeTable
		}

		const status = await EEFS.freeFS(context.fs)
		assert.equal(EEFS_DEVICE_IS_BUSY, status)
	})

})

describe('EEFS (empty)', () => {
	let context = {}

	beforeEach(async () => {
		context = await commonBeforeEach(true, true)
	})

	afterEach(async () => {
		const status = await EEFS.freeFS(context.fs)
		assert.equal(EEFS_SUCCESS, status)
	})

	it('should disallow undefined filename', async () => {
		const fd = await EEFS.open(context.fs, undefined, O_CREAT)
		assert.equal(EEFS_INVALID_ARGUMENT, fd)
	})

	it('should disallow non string filename', async () => {
		const fd = await EEFS.open(context.fs, true, O_CREAT)
		assert.equal(EEFS_INVALID_ARGUMENT, fd)
	})

	it('should disallow empty filename', async () => {
		const fd = await EEFS.open(context.fs, '', O_CREAT)
		assert.equal(EEFS_INVALID_ARGUMENT, fd)
	})

	it('should not open nonexistent files', async () => {
		const fd = await EEFS.open(context.fs, '404', O_RDONLY)
		assert.equal(EEFS_FILE_NOT_FOUND, fd)
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
		assert.equal(EEFS_PERMISSION_DENIED, status)

		await EEFS.close(context.fs, fd)
	})

	it('should prevent unknown attributes ', async () => {
		const fd = await EEFS.create(context.fs, 'test.tmp', 42)
		assert.equal(EEFS_INVALID_ARGUMENT, fd)
	})

	it('should error on closing invalid fd', async () => {
		const status = await EEFS.close(context.fd, 42)
		assert.equal(EEFS_INVALID_ARGUMENT, status)
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
		assert.equal(EEFS_SUCCESS, status)
	})

	it('should have files', async () => {
		assert.equal(3, context.fs.inodeTable.numberOfFiles)
	})

	it('should list files', async () => {
		const list = EEFS.listInodes(context.fs)
		const first = await list.next()
		assert.ok(!first.done)
		assert.notEqual(undefined, first.value)
		assert.equal('README.md', first.value.filename)

		const second = await list.next()
		assert.ok(!second.done)
		assert.notEqual(undefined, second.value)
		assert.equal('empty', second.value.filename)

		const third = await list.next()
		assert.ok(!third.done)
		assert.notEqual(undefined, third.value)
		assert.equal('🔒.json', third.value.filename)

		const last = await list.next()
		assert.ok(last.done)
		assert.equal(undefined, last.value)
	})
})

// describe('EEFS (full)', () => {
// 	let context = {}

// 	beforeEach(async () => {
// 		context = await commonBeforeEach(true, true, true, true)
// 	})

// 	afterEach(async () => {
// 		const status = await EEFS.freeFS(context.fs)
// 		assert.equal(EEFS_SUCCESS, status)
// 	})


// 	it('should have max inodesTable', () => {
// 		assert.equal(64, context.fs.inodeTable.files.length)
// 	})
// })

