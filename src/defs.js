
export const EEFS_LIB_IS_WRITE_PROTECTED = false


// eefs_config.h
export const EEFS_MAX_FILES = 64
export const EEFS_MAX_OPEN_FILES = 20
export const EEFS_DEFAULT_CREAT_SPARE_BYTES = 512

// eefs_fileapi.h
export const EEFS_FILESYS_MAGIC = 0xEEF51234
export const EEFS_MAX_FILENAME_SIZE = 40

export const EEFS_ATTRIBUTE_NONE = 0
export const EEFS_ATTRIBUTE_READONLY = 1

// FileDescriptorMode
export const EEFS_FREAD = 1
export const EEFS_FWRITE = 2
export const EEFS_FCREAT = 4

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

// eefs_version.h
export const EEFS_MAJOR_VERSION = (2)
export const EEFS_MINOR_VERSION = (0)
export const EEFS_REVISION      = (0)
export const EEFS_MISSION_REV   = (0)


// fcntl.h
// export const O_CLOEXEC =   0x0001
export const O_CREAT =     0x0002
// export const O_DIRECTORY = 0x0004
// export const O_EXCL =      0x0008
// export const O_NOCTTY =    0x0010
// export const O_NOFOLLOW =  0x0020
export const O_TRUNC =     0x0040
// export const O_TTY_INIT =  0x0080
// export const O_APPEND =    0x0100
// export const O_DSYNC =     0x0200
// export const O_NONBLOCK =  0x0400
// export const O_RSYNC =     0x0800
// export const O_SYNC =      0x0200
export const O_ACCMODE =   0xF000

// export const O_EXEC =      0x1000
export const O_RDONLY =    0x2000
 export const O_RDWR =      0xA000
// export const O_SEARCH =    0x4000
export const O_WRONLY =    0x8000
