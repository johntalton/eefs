import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
	EEFS,
	EEFS_NO_SUCH_DEVICE,
	EEFS_SUCCESS,
	O_ACCMODE,
	EEFS_FREAD,
	O_RDONLY,
	O_WRONLY,
	EEFS_FWRITE,
	O_RDWR,
	EEFS_FCREAT,
	O_CREAT,
	O_TRUNC,
	EEFS_DEVICE_IS_BUSY,
	EEFS_INVALID_ARGUMENT,
	EEFS_PERMISSION_DENIED,
	EEFS_FILE_NOT_FOUND
} from '@johntalton/eefs'
import { EEPROMArrayBuffer } from '@johntalton/eefs/eeprom-array-buffer'
import { modeFromFlags, range, roundUp, stripZeroU8 } from '../src/utils.js'

import { commonBeforeEach, DEFAULT_BASE_ADDRESS, DEFAULT_FS, DEFAULT_HELPERS } from './test-helpers.js'

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

