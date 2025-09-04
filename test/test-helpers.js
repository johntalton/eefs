import {
	format,
	EEFS,
	EEFS_SUCCESS,
	EEFS_ATTRIBUTE_NONE,
	EEFS_ATTRIBUTE_READONLY,
	EEFS_MAX_FILES,
} from '@johntalton/eefs'
import { EEPROMArrayBuffer } from '@johntalton/eefs/eeprom-array-buffer'

import { range } from '../src/utils.js'

/**
 * @import { EEFSFileSystemOptions, EEFSFileSystemHandle, EEFSFileSystem } from '@johntalton/eefs'
 */

export const DEFAULT_BASE_ADDRESS = 0

export const DEFAULT_HELPERS = {
	collator: new Intl.Collator(),
	encoder: new TextEncoder(),
	decoder: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
}

export async function addFile(fs, name, textContent, attributes = EEFS_ATTRIBUTE_NONE) {
	// console.log('addFile', fs.inodeTable.numberOfFiles, fs.inodeTable.freeMemorySize)
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

	// console.log('FAT Size', FILE_ALLOCATION_TABLE_SIZE)

	const size = 32 * 1024 / 8
	context.backingBuffer = new ArrayBuffer(size)

	context.options =  {
		eeprom: new EEPROMArrayBuffer(context.backingBuffer),
		...DEFAULT_HELPERS
	}

	context.baseAddress = DEFAULT_BASE_ADDRESS

	if(doFormat) {
		format(context.options.eeprom, context.baseAddress, size)

		if(doInit) {
			context.fs = await EEFS.initFS(context.options, context.baseAddress)
			if(context.fs.status !== EEFS_SUCCESS) { throw new Error('failed to init FS') }

			if(addFiles) {
				await addFile(context.fs, 'README.md', `
					# 🚀 NASA EEFS
					A Simple File System
					`)

				await addFile(context.fs, 'empty', undefined)

				await addFile(context.fs, '🔒.json', JSON.stringify({ readonly: true }), EEFS_ATTRIBUTE_READONLY)

				if(fill) {
					const count = EEFS_MAX_FILES

					for(const id of range(0, count - 1)) {
						try {
							// console.log('fill file count', id)
							await addFile(context.fs, `spam-${id}`, `Content for ${id}! of some arbitrary size, less then spare bytes `)
						}
						catch(e) {
							// full
							// console.log('fill file full', e, context.fs.inodeTable.freeMemorySize, context.fs.inodeTable.numberOfFiles)
							break
						}

						// console.log('addFile free pointer', context.fs.inodeTable.freeMemoryPointer)
						// console.log('addFile free memory', context.fs.inodeTable.freeMemorySize)
						// console.log('addFile number of files', context.fs.inodeTable.numberOfFiles)
					}


				}
			}
		}
	}

	return context
}

