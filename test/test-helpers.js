import {
	format,
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
	EEFS_MAX_FILES,
	EEFS_DEVICE_IS_BUSY,
	EEFS_ATTRIBUTE_NONE,
	EEFS_ATTRIBUTE_READONLY,
	EEFS_INVALID_ARGUMENT,
	EEFS_PERMISSION_DENIED,
	EEFS_FILE_NOT_FOUND,
	FILE_ALLOCATION_TABLE_SIZE
} from '@johntalton/eefs'
import { EEPROMArrayBuffer } from '@johntalton/eefs/eeprom-array-buffer'

import { modeFromFlags, range, roundUp, stripZeroU8 } from '../src/utils.js'


export const DEFAULT_BASE_ADDRESS = 0

/** @type {EEFSFileSystem} */
export const DEFAULT_FS = Object.freeze({
	inodeTable: {
		baseAddress: DEFAULT_BASE_ADDRESS,
		freeMemoryPointer: 0,
		freeMemorySize: 0,
		numberOfFiles: 0,
		files: []
	},
	fileDescriptorTable: [],
	fileDescriptorsInUse: 0,
	fileDescriptorsHighWaterMark: 0,
	directoryDescriptor: { },
	directoryEntry: {}
})

export const DEFAULT_HELPERS = {
	collator: new Intl.Collator(),
	encoder: new TextEncoder(),
	decoder: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
}

export async function addFile(fs, name, textContent, attributes = EEFS_ATTRIBUTE_NONE) {
	console.log('addFile', fs.inodeTable.numberOfFiles, fs.inodeTable.freeMemorySize)
	const encoder = new TextEncoder()
	const content = encoder.encode(textContent)
	const fd = await EEFS.create(fs, name, attributes)
	if(fd < 0) { throw new Error(`failed to create file: ${fd}`) }
	if(textContent !== undefined) {
		const status = await EEFS.write(fs, fd, content, content.byteLength)
		if(status !== EEFS_SUCCESS) { throw new Error('failed to write to file') }
	}
	await EEFS.close(fs, fd)
}

export async function commonBeforeEach(doFormat = false, doInit = false, addFiles = false, fill = false) {
	const context = {}

	console.log('FAT Size', FILE_ALLOCATION_TABLE_SIZE)

	const size = 32 * 1024 / 8
	context.backingBuffer = new ArrayBuffer(size)

	context.fs =  {
		eeprom: new EEPROMArrayBuffer(context.backingBuffer),
		...structuredClone(DEFAULT_FS),
		...DEFAULT_HELPERS
	}

	const baseAddress = DEFAULT_BASE_ADDRESS

	if(doFormat) {
		format(context.fs.eeprom, baseAddress, size)

		if(doInit) {
			await EEFS.initFS(context.fs, baseAddress)

			if(addFiles) {
				await addFile(context.fs, 'README.md', `
					# EEFS
					A simple File System
					`)

				await addFile(context.fs, 'empty', undefined)

				await addFile(context.fs, '🔒.json', JSON.stringify({ readonly: true }), EEFS_ATTRIBUTE_READONLY)

				if(fill) {
					const count = 5 // EEFS_MAX_FILES - 3

					for(const id of range(0, count - 1)) {
						await addFile(context.fs, `spam-${id}`, `Content for ${id}`)

						console.log('addFile free pointer', context.fs.inodeTable.freeMemoryPointer)
						console.log('addFile free memory', context.fs.inodeTable.freeMemorySize)
						console.log('addFile number of files', context.fs.inodeTable.numberOfFiles)
					}


				}
			}
		}
	}

	return context
}

