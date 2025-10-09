/*
 * @Author       : Cole
 * @Date         : 2025-09-30 17:57:51
 * @LastEditTime : 2025-10-09 15:48:59
 * @FilePath     : bspal_littlefs.c
 * @Description  : 
 * 
 *  Copyright (c) MentraOS Contributors 2025 
 *  SPDX-License-Identifier: Apache-2.0
 */

#include "bspal_littlefs.h"

#include <stdio.h>
#include <zephyr/device.h>
#include <zephyr/fs/fs.h>
#include <zephyr/fs/littlefs.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/storage/flash_map.h>

#define LOG_MODULE_NAME bspal_littlefs
LOG_MODULE_REGISTER(LOG_MODULE_NAME);
/* Matches LFS_NAME_MAX */
#define MAX_PATH_LEN   50//255
#define TEST_FILE_SIZE 547

static uint8_t file_test_pattern[TEST_FILE_SIZE];

#if DT_NODE_EXISTS(PARTITION_NODE)
FS_FSTAB_DECLARE_ENTRY(PARTITION_NODE);
#else  /* PARTITION_NODE */
FS_LITTLEFS_DECLARE_DEFAULT_CONFIG(littlefs_storage);
static struct fs_mount_t lfs_storage_mnt = {
    .type        = FS_LITTLEFS,
    .fs_data     = &littlefs_storage,
    .storage_dev = (void *)FIXED_PARTITION_ID(littlefs_storage),
    .mnt_point   = "/lfs",
};
#endif /* PARTITION_NODE */

struct fs_mount_t *mountpoint =
#if DT_NODE_EXISTS(PARTITION_NODE)
    &FS_FSTAB_ENTRY(PARTITION_NODE)
#else
    &lfs_storage_mnt
#endif
    ;

static int lsdir(const char *path)
{
    int                     res;
    struct fs_dir_t         dirp;
    static struct fs_dirent entry;

    fs_dir_t_init(&dirp);

    /* Verify fs_opendir() */
    res = fs_opendir(&dirp, path);
    if (res)
    {
        LOG_ERR("Error opening dir %s [%d]", path, res);
        return res;
    }

    LOG_INF("\nListing dir %s ...", path);
    for (;;)
    {
        /* Verify fs_readdir() */
        res = fs_readdir(&dirp, &entry);

        /* entry.name[0] == 0 means end-of-dir */
        if (res || entry.name[0] == 0)
        {
            if (res < 0)
            {
                LOG_ERR("Error reading dir [%d]", res);
            }
            break;
        }

        if (entry.type == FS_DIR_ENTRY_DIR)
        {
            LOG_INF("[DIR ] %s", entry.name);
        }
        else
        {
            LOG_INF("[FILE] %s (size = %zu)", entry.name, entry.size);
        }
    }

    /* Verify fs_closedir() */
    fs_closedir(&dirp);

    return res;
}

static int littlefs_increase_infile_value(char *fname)
{
    uint8_t          boot_count = 0;
    struct fs_file_t file;
    int              rc, ret;

    fs_file_t_init(&file);
    rc = fs_open(&file, fname, FS_O_CREATE | FS_O_RDWR);
    if (rc < 0)
    {
        LOG_ERR("FAIL: open %s: %d", fname, rc);
        return rc;
    }

    rc = fs_read(&file, &boot_count, sizeof(boot_count));
    if (rc < 0)
    {
        LOG_ERR("FAIL: read %s: [rd:%d]", fname, rc);
        goto out;
    }
    LOG_INF("%s read count:%u (bytes: %d)", fname, boot_count, rc);

    rc = fs_seek(&file, 0, FS_SEEK_SET);
    if (rc < 0)
    {
        LOG_ERR("FAIL: seek %s: %d", fname, rc);
        goto out;
    }

    boot_count += 1;
    rc = fs_write(&file, &boot_count, sizeof(boot_count));
    if (rc < 0)
    {
        LOG_ERR("FAIL: write %s: %d", fname, rc);
        goto out;
    }

    LOG_INF("%s write new boot count %u: [wr:%d]", fname, boot_count, rc);

out:
    ret = fs_close(&file);
    if (ret < 0)
    {
        LOG_ERR("FAIL: close %s: %d", fname, ret);
        return ret;
    }

    return (rc < 0 ? rc : 0);
}

static void incr_pattern(uint8_t *p, uint16_t size, uint8_t inc)
{
    uint8_t fill = 0x55;

    if (p[0] % 2 == 0)
    {
        fill = 0xAA;
    }

    for (int i = 0; i < (size - 1); i++)
    {
        if (i % 8 == 0)
        {
            p[i] += inc;
        }
        else
        {
            p[i] = fill;
        }
    }

    p[size - 1] += inc;
}

static void init_pattern(uint8_t *p, uint16_t size)
{
    uint8_t v = 0x1;

    memset(p, 0x55, size);

    for (int i = 0; i < size; i += 8)
    {
        p[i] = v++;
    }

    p[size - 1] = 0xAA;
}

static void print_pattern(uint8_t *p, uint16_t size)
{
    int i, j = size / 16, k;

    // for (k = 0, i = 0; k < j; i += 16, k++)
    // {
    //     LOG_INF("%02x %02x %02x %02x %02x %02x %02x %02x ", p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5],
    //             p[i + 6], p[i + 7]);
    //     LOG_INF("%02x %02x %02x %02x %02x %02x %02x %02x\n", p[i + 8], p[i + 9], p[i + 10], p[i + 11], p[i + 12],
    //             p[i + 13], p[i + 14], p[i + 15]);

    //     /* Mark 512B (sector) chunks of the test file */
    //     if ((k + 1) % 32 == 0)
    //     {
    //         LOG_INF("\n");
    //     }
    // }

    // for (; i < size; i++)
    // {
    //     LOG_INF("%02x ", p[i]);
    // }

    LOG_INF("\n");
}

static int littlefs_binary_file_adj(char *fname)
{
    struct fs_dirent dirent;
    struct fs_file_t file;
    int              rc, ret;

    /*
     * Uncomment below line to force re-creation of the test pattern
     * file on the littlefs FS.
     */
    /* fs_unlink(fname); */
    fs_file_t_init(&file);

    rc = fs_open(&file, fname, FS_O_CREATE | FS_O_RDWR);
    if (rc < 0)
    {
        LOG_ERR("FAIL: open %s: %d", fname, rc);
        return rc;
    }

    rc = fs_stat(fname, &dirent);
    if (rc < 0)
    {
        LOG_ERR("FAIL: stat %s: %d", fname, rc);
        goto out;
    }

    /* Check if the file exists - if not just write the pattern */
    if (rc == 0 && dirent.type == FS_DIR_ENTRY_FILE && dirent.size == 0)
    {
        LOG_INF("Test file: %s not found, create one!", fname);
        init_pattern(file_test_pattern, sizeof(file_test_pattern));
    }
    else
    {
        rc = fs_read(&file, file_test_pattern, sizeof(file_test_pattern));
        if (rc < 0)
        {
            LOG_ERR("FAIL: read %s: [rd:%d]", fname, rc);
            goto out;
        }
        incr_pattern(file_test_pattern, sizeof(file_test_pattern), 0x1);
    }

    LOG_INF("------ FILE: %s ------", fname);
    print_pattern(file_test_pattern, sizeof(file_test_pattern));

    rc = fs_seek(&file, 0, FS_SEEK_SET);
    if (rc < 0)
    {
        LOG_ERR("FAIL: seek %s: %d", fname, rc);
        goto out;
    }

    rc = fs_write(&file, file_test_pattern, sizeof(file_test_pattern));
    if (rc < 0)
    {
        LOG_ERR("FAIL: write %s: %d", fname, rc);
    }

out:
    ret = fs_close(&file);
    if (ret < 0)
    {
        LOG_ERR("FAIL: close %s: %d", fname, ret);
        return ret;
    }

    return (rc < 0 ? rc : 0);
}

static int littlefs_flash_erase(unsigned int id)
{
    const struct flash_area *pfa;
    int                      rc;

    rc = flash_area_open(id, &pfa);
    if (rc < 0)
    {
        LOG_ERR("FAIL: unable to find flash area %u: %d", id, rc);
        return rc;
    }
    LOG_INF("Area %u at 0x%x on %s for %u bytes", id, (unsigned int)pfa->fa_off, pfa->fa_dev->name, (unsigned
    int)pfa->fa_size);

    /* Optional wipe flash contents */
    if (IS_ENABLED(CONFIG_APP_WIPE_STORAGE))
    {
        rc = flash_area_flatten(pfa, 0, pfa->fa_size);
        LOG_ERR("Erasing flash area ... %d", rc);
    }

    flash_area_close(pfa);
    return rc;
}
static int littlefs_mount(struct fs_mount_t *mp)
{
    int rc;

    rc = littlefs_flash_erase((uintptr_t)mp->storage_dev);
    if (rc < 0)
    {
        LOG_ERR("FAIL: erase id %" PRIuPTR " at %s: %d", (uintptr_t)mp->storage_dev, mp->mnt_point, rc);
        return rc;
    }

    /* Do not mount if auto-mount has been enabled */
    // 如果已启用自动挂载，则不要挂载
#if !DT_NODE_EXISTS(PARTITION_NODE) || !(FSTAB_ENTRY_DT_MOUNT_FLAGS(PARTITION_NODE) & FS_MOUNT_FLAG_AUTOMOUNT)
    rc = fs_mount(mp);// 挂载 mountpoint
    if (rc < 0)
    {
        LOG_ERR("FAIL: mount id %" PRIuPTR " at %s: %d", (uintptr_t)mp->storage_dev, mp->mnt_point, rc);
        return rc;
    }
    LOG_INF("%s mount: %d", mp->mnt_point, rc);
#else
    LOG_INF("%s automounted", mp->mnt_point);
#endif

    return 0;
}

int littlefs_test(void)
{
    char              fname1[MAX_PATH_LEN];
    char              fname2[MAX_PATH_LEN];
    struct fs_statvfs sbuf;
    int               rc;
    LOG_INF("Sample program to r/w files on littlefs");
    rc = littlefs_mount(mountpoint);
    if (rc < 0)
    {
        LOG_ERR("FAIL: mount: %d", rc);
        return 0;
    }

    snprintf(fname1, sizeof(fname1), "%s/boot_count", mountpoint->mnt_point);
    snprintf(fname2, sizeof(fname2), "%s/pattern.bin", mountpoint->mnt_point);

    rc = fs_statvfs(mountpoint->mnt_point, &sbuf);/** 获取文件系统信息；get file system info */
    if (rc < 0)
    {
        LOG_INF("FAIL: statvfs: %d", rc);
        goto out;
    }

    LOG_INF("%s: bsize = %lu ; frsize = %lu ;" " blocks = %lu ; bfree = %lu",
        mountpoint->mnt_point, sbuf.f_bsize, sbuf.f_frsize, sbuf.f_blocks, sbuf.f_bfree);

    rc = lsdir(mountpoint->mnt_point);
    if (rc < 0)
    {
        LOG_INF("FAIL: lsdir %s: %d", mountpoint->mnt_point, rc);
        goto out;
    }

    rc = littlefs_increase_infile_value(fname1);
    if (rc)
    {
        goto out;
    }

    rc = littlefs_binary_file_adj(fname2);
    if (rc)
    {
        goto out;
    }

out:
    rc = fs_unmount(mountpoint);
    LOG_INF("%s unmount: %d", mountpoint->mnt_point, rc);
    return 0;
}
