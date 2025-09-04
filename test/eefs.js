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
	EEFS_FILE_NOT_FOUND,
	O_RDWR,
	O_ACCMODE,
	O_TRUNC,
	O_WRONLY,
	EEFS_MAX_OPEN_FILES,
	EEFS_NO_FREE_FILE_DESCRIPTOR,
	EEFS_ATTRIBUTE_READONLY,
	EEFS_ATTRIBUTE_NONE,
	FILE_ALLOCATION_TABLE_SIZE,
	SEEK_SET
} from '@johntalton/eefs'
import { EEPROMArrayBuffer } from '@johntalton/eefs/eeprom-array-buffer'

import { commonBeforeEach, DEFAULT_BASE_ADDRESS, DEFAULT_HELPERS } from './test-helpers.js'
import { range } from '../src/utils.js'

describe('EEFS (no context)', () => {
	it('requires minimum eeprom size', async () => {
		const size = 8
		const backingBuffer = new ArrayBuffer(size)

		const options =  {
			eeprom: new EEPROMArrayBuffer(backingBuffer),
			...DEFAULT_HELPERS
		}

		// can not format under size
		// format(fs.eeprom, DEFAULT_BASE_ADDRESS, size)

		await assert.rejects(async () => {
			await EEFS.initFS(options, DEFAULT_BASE_ADDRESS)
		})
	})
})

describe('EEFS (unformatted)', () => {
	let context = {}

	beforeEach(async () => {
		context = await commonBeforeEach(false, false)
	})

	it('should fail unformatted inits', async () => {
		const handle = await EEFS.initFS(context.options, DEFAULT_BASE_ADDRESS)
		assert.equal(handle.status, EEFS_NO_SUCH_DEVICE)
	})
})

describe('EEFS (formatted)', () => {
	let context = {}

	beforeEach(async () => {
		context = await commonBeforeEach(true, false)
	})

	it('should not init if no device', () => {

	})

	it('should not init if bad version', async () => {
		const backingU32 = new Uint32Array(context.backingBuffer)
		backingU32[2] = 42 // version is at offset 2

		const handle = await EEFS.initFS(context.options, DEFAULT_BASE_ADDRESS)
		assert.equal(handle.status, EEFS_NO_SUCH_DEVICE)
	})

	it('should not init if max files', async () => {
		const backingU32 = new Uint32Array(context.backingBuffer)
		backingU32[5] = 0xFFFF // numberOfFiles is at offset 5

		const handle = await EEFS.initFS(context.options, DEFAULT_BASE_ADDRESS)
		assert.equal(handle.status, EEFS_NO_SUCH_DEVICE)
	})

	it('should init', async () => {
		const handle = await EEFS.initFS(context.options, DEFAULT_BASE_ADDRESS)
		assert.equal(handle.status, EEFS_SUCCESS)
		assert.equal(handle.inodeTable.baseAddress, DEFAULT_BASE_ADDRESS)
		assert.equal(handle.inodeTable.freeMemorySize, 32 * 1024 / 8 - FILE_ALLOCATION_TABLE_SIZE)
		assert.equal(handle.inodeTable.numberOfFiles, 0)
		assert.ok(Array.isArray(handle.inodeTable.files))
		assert.equal(handle.inodeTable.files.length, 0)

		assert.ok(Array.isArray(handle.fileDescriptorTable))
		assert.equal(handle.fileDescriptorTable.length, 0)
		assert.equal(handle.fileDescriptorsInUse, 0)
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

	it('should disallow open undefined filename', async () => {
		// @ts-ignore
		const fd = await EEFS.open(context.fs, undefined, O_CREAT)
		assert.equal(fd, EEFS_INVALID_ARGUMENT)
	})

	it('should disallow open non string filename', async () => {
		// @ts-ignore
		const fd = await EEFS.open(context.fs, true, O_CREAT)
		assert.equal(fd, EEFS_INVALID_ARGUMENT)
	})

	it('should disallow open with long filename', async () => {
		const filename = '1234567890123456789012345678901234567890-extra'
		const fd = await EEFS.open(context.fs, filename, O_CREAT)
		assert.equal(fd, EEFS_INVALID_ARGUMENT)
	})

	it('should error create with invalid filename', async () => {
		const fd = await EEFS.create(context.fs, '')
		assert.equal(fd, EEFS_INVALID_ARGUMENT)
	})

	it('should error open with invalid filename', async () => {
		const fd = await EEFS.open(context.fs, '', O_CREAT)
		assert.equal(fd, EEFS_INVALID_ARGUMENT)
	})

	it('should not open nonexistent files', async () => {
		const fd = await EEFS.open(context.fs, '404', O_RDONLY)
		assert.equal(fd, EEFS_FILE_NOT_FOUND)
	})

	it('should create from open with flag', async () => {
		const fd = await EEFS.open(context.fs, 'test1.tmp', O_CREAT)
		assert.ok(fd >= 0)

		await EEFS.close(context.fs, fd)
	})

	it('should not create from open without flag', async () => {
		const fd = await EEFS.open(context.fs, 'test1.tmp', O_RDWR)
		assert.equal(fd, EEFS_FILE_NOT_FOUND)
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

	it('should reject writeData with miss-matched length', async () => {
		const fd = await EEFS.create(context.fs, 'test.tmp')

		await assert.rejects(async () => {
			await EEFS.write(context.fs, fd, new ArrayBuffer(10), 20)
		})

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
		assert.equal(status, EEFS_SUCCESS, 'afterEach failure (open file?)')
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

	it('should open from create', async () => {
		const fd = await EEFS.create(context.fs, 'README.md')
		assert.ok(fd >= 0)

		await EEFS.close(context.fs, fd)
	})

	it('should open from open', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', O_RDWR)
		assert.ok(fd >= 0)

		await EEFS.close(context.fs, fd)
	})

	it('should fail open with unknown flags', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', ~(O_ACCMODE|O_CREAT|O_TRUNC))
		assert.equal(fd, EEFS_INVALID_ARGUMENT)
	})

	it('should fail to open for write with readonly file', async () => {
		const fd = await EEFS.open(context.fs, '🔒.json', O_WRONLY)
		assert.equal(fd, EEFS_PERMISSION_DENIED)
	})

	it('show not allow opening for write if existing open for write', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', O_RDWR)
		assert.ok(fd >= 0)

		const status = await EEFS.open(context.fs, 'README.md', O_WRONLY)
		assert.equal(status,EEFS_PERMISSION_DENIED )

		await EEFS.close(context.fs, fd)
	})

	it('should not allow open after max', async () => {
		const fds = await Promise.all(range(0, EEFS_MAX_OPEN_FILES - 1).map(async i => {
			const fd = await EEFS.open(context.fs, 'README.md', O_RDONLY)
			assert.ok(fd >= 0)
			return fd
		}))

		const count = EEFS.getFileDescriptorsInUse(context.fs)
		assert.equal(count, 20)

		const status = await EEFS.open(context.fs, 'README.md', O_RDONLY)
		assert.equal(status, EEFS_NO_FREE_FILE_DESCRIPTOR)

		await Promise.all(fds.map(async fd => {
			const status = await EEFS.close(context.fs, fd)
			assert.equal(status, EEFS_SUCCESS)
		}))
	})

	it('should not allow create after max', async () => {
		const fds = await Promise.all(range(0, EEFS_MAX_OPEN_FILES - 1).map(async i => {
			const fd = await EEFS.open(context.fs, 'README.md', O_RDONLY)
			assert.ok(fd >= 0)
			return fd
		}))

		const count = EEFS.getFileDescriptorsInUse(context.fs)
		assert.equal(count, 20)

		const status = await EEFS.create(context.fs, 'NewFile.txt')
		assert.equal(status, EEFS_NO_FREE_FILE_DESCRIPTOR)

		await Promise.all(fds.map(async fd => {
			const status = await EEFS.close(context.fs, fd)
			assert.equal(status, EEFS_SUCCESS)
		}))
	})

	it('should not fstat invalid fd', async () => {
		const stat = {}
		const status = await EEFS.fstat(context.fs, 42, stat)
		assert.equal(status, EEFS_INVALID_ARGUMENT)
	})

	it('should fstat open file', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', O_RDONLY)
		assert.ok(fd >= 0)

		const stat = {}
		const status = await EEFS.fstat(context.fs, fd, stat)
		assert.equal(status, EEFS_SUCCESS)

		assert.equal(stat.filename, 'README.md')
		assert.equal(stat.fileSize, 54)

		await EEFS.close(context.fs, fd)
	})

	it('should not read invalid fd', async () => {
		const ab = new ArrayBuffer(64)
		const bytesRead = await EEFS.read(context.fs, 42, 0, ab)
		assert.equal(bytesRead, EEFS_INVALID_ARGUMENT)
	})

	it('should not read zero bytes', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', O_RDONLY)
		assert.ok(fd >= 0)

		const ab = new ArrayBuffer(64)
		const bytesRead = await EEFS.read(context.fs, fd, 0, ab)
		assert.equal(bytesRead, EEFS_INVALID_ARGUMENT)

		await EEFS.close(context.fs, fd)
	})

	it('should not read into zero bytes buffer', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', O_RDONLY)
		assert.ok(fd >= 0)

		const ab = new ArrayBuffer(0)
		const bytesRead = await EEFS.read(context.fs, fd, 54, ab)
		assert.equal(bytesRead, EEFS_INVALID_ARGUMENT)

		await EEFS.close(context.fs, fd)
	})

	it('should not read if not open for reading', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', O_WRONLY)
		assert.ok(fd >= 0)

		const ab = new ArrayBuffer(64)
		const bytesRead = await EEFS.read(context.fs, fd, 54, ab)
		assert.equal(bytesRead, EEFS_PERMISSION_DENIED)

		await EEFS.close(context.fs, fd)
	})

	it('should read file', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', O_RDONLY)
		assert.ok(fd >= 0)

		const ab = new ArrayBuffer(64)
		const bytesRead = await EEFS.read(context.fs, fd, 54, ab)
		assert.ok(bytesRead >= 0)
		assert.equal(bytesRead, 54)

		await EEFS.close(context.fs, fd)
	})

	it('should not allow rename of invalid source file name', async () => {
		const status = await EEFS.rename(context.fs, '', 'AnythingValid')
		assert.equal(status, EEFS_INVALID_ARGUMENT)
	})

	it('should not allow rename of invalid target file name', async () => {
		const status = await EEFS.rename(context.fs, 'README.md', '')
		assert.equal(status, EEFS_INVALID_ARGUMENT)
	})

	it('should not allow rename of non-existent file name', async () => {
		const status = await EEFS.rename(context.fs, 'FakeFile.txt', 'New.txt')
		assert.equal(status, EEFS_FILE_NOT_FOUND)
	})

	it('should not allow rename to existing target', async () => {
		const status = await EEFS.rename(context.fs, 'FakeFile.txt', 'README.md')
		assert.equal(status, EEFS_PERMISSION_DENIED)
	})

	it('should not allow rename of readonly file', async () => {
		const status = await EEFS.rename(context.fs, '🔒.json', '🔓.json')
		assert.equal(status, EEFS_PERMISSION_DENIED)
	})

	it('should allow rename of file', async () => {
		const status = await EEFS.rename(context.fs, 'README.md', 'README.old')
		assert.equal(status, EEFS_SUCCESS)
	})

	it('should not stat invalid filename', async () => {
		const stat = {}
		const status = await EEFS.stat(context.fs, '', stat)
		assert.equal(status, EEFS_INVALID_ARGUMENT)
	})

	it('should not setAttribute to invalid values', async () => {
		const status = await EEFS.setFileAttributes(context.fs, 'README.md', 42)
		assert.equal(status, EEFS_INVALID_ARGUMENT)
	})

	it('should not setAttribute of invalid filename=', async () => {
		const status = await EEFS.setFileAttributes(context.fs, '', EEFS_ATTRIBUTE_READONLY)
		assert.equal(status, EEFS_INVALID_ARGUMENT)
	})

	it('should not setAttribute to non-existent file', async () => {
		const status = await EEFS.setFileAttributes(context.fs, 'FakeFile', EEFS_ATTRIBUTE_READONLY)
		assert.equal(status, EEFS_FILE_NOT_FOUND)
	})

	it('should not setAttribute of readonly file', { skip: 'succeeds - but should it?' }, async () => {
		const status = await EEFS.setFileAttributes(context.fs, '🔒.json', EEFS_ATTRIBUTE_NONE)
		assert.equal(status, EEFS_PERMISSION_DENIED)
	})

	it('should setAttribute of valid file', async () => {
		const status = await EEFS.setFileAttributes(context.fs, 'README.md', EEFS_ATTRIBUTE_READONLY)
		assert.equal(status, EEFS_SUCCESS)
	})

	it('should list open files', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', O_RDONLY)
		assert.ok(fd >= 0)

		const iter = EEFS.listOpenFiles(context.fs)
		const item = await iter.next()
		assert.equal(item.done, false)
		assert.equal(item.value, 'README.md')

		const last = await iter.next()
		assert.equal(last.done, true)
		assert.equal(last.value, undefined)

		await EEFS.close(context.fs, fd)
	})

	it('should not allow invalid fd (negative value)', async () => {
		const status = await EEFS.close(context.fs, -42)
		assert.equal(status, EEFS_INVALID_ARGUMENT)
	})

	it('should not allow remove on bad file name', async () => {
		const status = await EEFS.remove(context.fs, '')
		assert.equal(status, EEFS_INVALID_ARGUMENT)
	})

	it('should not allow remove of not found file', async () => {
		const status = await EEFS.remove(context.fs, 'some_file_name')
		assert.equal(status, EEFS_FILE_NOT_FOUND)
	})

	it('should not allow remove of readonly file', async () => {
		const status = await EEFS.remove(context.fs, '🔒.json')
		assert.equal(status, EEFS_PERMISSION_DENIED)
	})

	it('should not allow remove of open file', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', O_RDONLY)

		const status = await EEFS.remove(context.fs, 'README.md')
		assert.equal(status, EEFS_PERMISSION_DENIED)

		await EEFS.close(context.fs, fd)
	})

	it('should remove file', async () => {
		const initialFileListing = await Array.fromAsync(EEFS.listInodes(context.fs))
		assert.equal(initialFileListing.length, 3)

		assert.equal(context.fs.inodeTable.numberOfFiles, 3)
		const backingU8 = new Uint8Array(context.backingBuffer)
		// InUse is true
		assert.equal(backingU8[536 + 4 + 3], 1)

		const status = await EEFS.remove(context.fs, 'README.md')
		assert.equal(status, EEFS_SUCCESS)
		assert.equal(context.fs.inodeTable.numberOfFiles, 3)

		const inodeIndexOfRemovedFile = 0
		assert.equal(context.fs.inodeTable.files[inodeIndexOfRemovedFile].fileHeaderPointer, 536)

		// check InUse is false
		assert.equal(backingU8[536 + 4 + 3], 0)

		const statStatus = await EEFS.stat(context.fs, 'README.md', {})
		assert.equal(statStatus, EEFS_FILE_NOT_FOUND)

		const fileListing = await Array.fromAsync(EEFS.listInodes(context.fs))
		assert.equal(fileListing.length, 2)
	})

	it('should not allow seek of bad file descriptor', async () => {
		const status = EEFS.seek(context.fs, -1, 42, SEEK_SET)
		assert.equal(status, EEFS_INVALID_ARGUMENT)
	})

	it('should not allow seek set out of bounds', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', O_RDWR)
		const byteOffset = EEFS.seek(context.fs, fd, 1000, SEEK_SET)
		assert.equal(byteOffset, EEFS_INVALID_ARGUMENT)

		await EEFS.close(context.fs, fd)
	})

	it('should allow seek set beyond EOF to fileSize', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', O_RDWR)
		const byteOffset = EEFS.seek(context.fs, fd, 77, SEEK_SET)
		assert.equal(byteOffset, 54)

		await EEFS.close(context.fs, fd)
	})

	it('should allow seek set less then fileSize to specific value', async () => {
		const fd = await EEFS.open(context.fs, 'README.md', O_RDWR)
		const byteOffset = EEFS.seek(context.fs, fd, 42, SEEK_SET)
		assert.equal(byteOffset, 42)

		await EEFS.close(context.fs, fd)
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

		// 61 + 512 = 573 align 4 = 576
		assert.equal(context.fs.inodeTable.files[stat.inodeIndex].maxFileSize, 576)
	})

	it('should have spam-2 with stats and truncated max', async () => {
		const stat = {}
		const status = await EEFS.stat(context.fs, 'spam-2', stat)
		assert.equal(status, EEFS_SUCCESS)

		assert.equal(stat.filename, 'spam-2')
		assert.equal(stat.fileSize, 61)
		assert.equal(stat.inodeIndex, 5)

		// truncated: 61 + 512 = 573 align 4 = 576
		assert.equal(context.fs.inodeTable.files[stat.inodeIndex].maxFileSize, 412)
	})

	it('should not have spam-3', async () => {
		const stat = {}
		const status = await EEFS.stat(context.fs, 'spam-3', stat)
		assert.equal(status, EEFS_FILE_NOT_FOUND)
	})

	it('should re-initFS', async () => {
		const freeStatus = EEFS.freeFS(context.fs)
		assert.equal(freeStatus, EEFS_SUCCESS)
		const result = await EEFS.initFS(context.options, DEFAULT_BASE_ADDRESS)
		assert.equal(result.status, EEFS_SUCCESS)

		assert.equal(result.inodeTable.numberOfFiles, 6)

	})
})

