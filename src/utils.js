import {
	EEFS_FCREAT,
	EEFS_FREAD,
	EEFS_FWRITE,
	O_ACCMODE,
	O_CREAT,
	O_RDONLY,
	O_RDWR,
	O_WRONLY
} from './defs.js'

/**
 * @import {
 *  FileSystemFlags,
 *  FileDescriptorMode,
 * } from './types.js'
 */

/**
 * @param {number} start
 * @param {number} end
 * @param {number} [step = 1]
 * @returns {Generator<number>}
 */
// export function* _range(start, end, step = 1) {
// 	yield start
// 	if (start >= end) return
// 	yield* range(start + step, end, step)
// }

/**
 * @param {number} start
 * @param {number} end
 * @param {number} [step = 1]
 * @returns {Generator<number>}
 */
export function* range(start, end, step = 1) {
	for(let i = start; i <= end; i += step) {
		yield i
	}
}

/**
 * @param {number} value
 * @param {number} align
 * @returns {number}
 */
export function roundUp(value, align) {
	return (value + (align - 1)) & ~(align - 1)
}


/**
 * @param {FileSystemFlags} flags
 * @returns {FileDescriptorMode}
 */
export function modeFromFlags(flags) {
	if(flags === undefined) { throw new TypeError('flags undefined') }

	// Original code used the following, however
	// it assumed that the flags values are the
	// least significant bits and thus zero + 1
	// would result in a 1. however, if the
	// flags are using high order bits for Access
	// then the result would not be 1
	//
	// return (flags & O_ACCMODE) + 1

	const access = flags & O_ACCMODE
	return 0 |
		(((access & O_RDONLY) === O_RDONLY) ? EEFS_FREAD : 0) |
		(((access & O_WRONLY) === O_WRONLY) ? EEFS_FWRITE : 0) |
		(((access & O_RDWR) === O_RDWR) ? EEFS_FWRITE|EEFS_FREAD : 0) |
		(((flags & O_CREAT) === O_CREAT) ? EEFS_FCREAT : 0)
}

/**
 * @param {Uint8Array} u8
 */
export function lastNonZeroIndex(u8) {
	for(let i = u8.length - 1; i >= 0; i -= 1) {
		if(u8[i] !== 0) { return i }
	}
	return -1
}

/**
 * @param {Uint8Array} u8
 */
export function stripZeroU8(u8) {
	if(u8 === undefined) { throw new TypeError('u8 buffer undefined') }
	if(!ArrayBuffer.isView(u8)) { throw new TypeError('u8 is not a view')}
	if(u8.BYTES_PER_ELEMENT !== 1) { throw new TypeError('u8 i not 8bit')}

	const nonZeroIndex = lastNonZeroIndex(u8)
	if(nonZeroIndex === -1) { return Uint8Array.from([ ]) }

	return u8.subarray(0, nonZeroIndex + 1)
}