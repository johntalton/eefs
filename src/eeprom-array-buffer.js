export class EEPROMArrayBuffer {
	#bufferU8

	get buffer() { return this.#bufferU8.buffer }

	constructor(buffer) {
		this.#bufferU8 = ArrayBuffer.isView(buffer) ?
			new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) :
			new Uint8Array(buffer, 0, buffer.byteLength)
	}

	async read(offset, length, into) {
		if(into === undefined) {
			return this.#bufferU8.subarray(offset, offset + length)
		}

		const intoU8 = ArrayBuffer.isView(into) ?
			new Uint8Array(into.buffer, into.byteOffset, into.byteLength) :
			new Uint8Array(into, 0, into.byteLength)

		intoU8.set(this.#bufferU8.subarray(offset, offset + length))

		return intoU8
	}

	async write(offset, buffer) {
		const u8 = ArrayBuffer.isView(buffer) ?
			new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) :
			new Uint8Array(buffer, 0, buffer.byteLength)

		this.#bufferU8.set(u8, offset)
	}
}
