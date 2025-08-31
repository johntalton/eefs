//
export const EEFS_LIB_IS_WRITE_PROTECTED = false

//
export const EEFS_MAX_FILES = 64
export const EEFS_MAX_OPEN_FILES = 20
export const EEFS_DEFAULT_CREATE_SPARE_BYTES = 512
export const EEFS_MAX_FILENAME_SIZE = 40

//
export const EEFS_FILESYSTEM_MAGIC = 0xEEF51234
export const EEFS_FILESYSTEM_VERSION = 1

// FileAttributes
export const EEFS_ATTRIBUTE_NONE = 0
export const EEFS_ATTRIBUTE_READONLY = 1
// export const EEFS_ATTRIBUTE_HIDDEN =
// export const EEFS_ATTRIBUTE_TEMPORARY =
// export const EEFS_ATTRIBUTE_NO_UNLINK =
// export const EEFS_ATTRIBUTE_BINARY =
// export const EEFS_ATTRIBUTE_DIRECTORY =

// FileDescriptorMode
export const EEFS_FREAD = 1
export const EEFS_FWRITE = 2
export const EEFS_FCREAT = 4

// SeekOrigin
export const SEEK_SET = 0
export const SEEK_CUR = 1
export const SEEK_END = 2

// StatusCode
export const EEFS_SUCCESS = (0)
export const EEFS_ERROR = (-1)
export const EEFS_INVALID_ARGUMENT = (-2)
export const EEFS_UNSUPPORTED_OPTION = (-3)
export const EEFS_PERMISSION_DENIED = (-4)
export const EEFS_FILE_NOT_FOUND = (-5)
export const EEFS_NO_FREE_FILE_DESCRIPTOR = (-6)
export const EEFS_NO_SPACE_LEFT_ON_DEVICE = (-7)
export const EEFS_NO_SUCH_DEVICE = (-8)
export const EEFS_DEVICE_IS_BUSY = (-9)
export const EEFS_READ_ONLY_FILE_SYSTEM = (-10)

//
export const O_CREAT   = 0x0002
export const O_TRUNC   = 0x0040
export const O_RDONLY  = 0x2000
export const O_RDWR    = 0xA000
export const O_WRONLY  = 0x8000
export const O_ACCMODE = 0xF000

//
// export const O_CREAT   = 0x0200
// export const O_TRUNC   = 0x0400
// export const O_RDONLY  = 0x0000
// export const O_WRONLY  = 0x0001
// export const O_RDWR    = 0x0002
// export const O_ACCMODE = 0x0003

