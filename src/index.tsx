import OneBotBot from '@koishijs/plugin-adapter-onebot'
import { Bot, Context, Schema, sleep } from 'koishi'

export const name = 'verify'

export interface Config {
  banDuration: number
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    banDuration: Schema.number().default(15 * 24 * 60 * 60),
  }).description('基础'),
])

declare module 'koishi' {
  interface Tables {
    verify: Verify
  }
}

export interface Verify {
  /**
   * 自增主键
   */
  id: number

  /**
   * 用户 QQ 号
   */
  qq: number

  /**
   * 目标群号
   */
  group: number

  /**
   * 上次禁言时刻，0 为未禁言
   */
  banned: number
}

/**
 * 禁言
 */
const ban = async (bot: Bot, config: Config, qq: number, group: number) => {
  await bot.internal.setGroupBanAsync(group, qq, config.banDuration)

  await bot.ctx.database.upsert(
    'verify',
    [
      {
        qq,
        group,
        banned: new Date().getTime(),
      },
    ],
    ['qq', 'group']
  )
}

/**
 * 解禁
 */
const unban = async (bot: Bot, config: Config, qq: number, group: number) => {
  await bot.internal.setGroupBanAsync(group, qq, 0)

  await bot.ctx.database.upsert(
    'verify',
    [
      {
        qq,
        group,
        banned: 0,
      },
    ],
    ['qq', 'group']
  )
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('verify')

  ctx.model.extend(
    'verify',
    {
      id: {
        type: 'unsigned',
        length: 10,
        nullable: false,
      },
      qq: {
        type: 'unsigned',
        length: 11,
        nullable: false,
      },
      group: {
        type: 'unsigned',
        length: 11,
        nullable: false,
      },
      banned: {
        type: 'unsigned',
        length: 13,
        nullable: false,
      },
    },
    {
      autoInc: true,
      unique: [['qq', 'group']],
    }
  )

  // 有人加群时
  ctx.on('guild-member-added', (session) => {
    logger.info(`Member ${session.userId} added into ${session.channelId}`)

    // 禁言对应用户
    ban(session.bot, config, Number(session.userId), Number(session.channelId))

    // 发送入群欢迎消息
    session.send(
      <>
        <at id={session.userId} />
        欢迎小伙伴入群~请认真阅读群公告，阅读后点击公告中的「参与讨论」即可解禁哦~
      </>
    )
  })

  // 注册根指令
  ctx.command('verify', {
    authority: 4,
  })

  // ban 指令
  ctx.command('verify/ban <user:user>').action(({ session }, user) => {
    // 获取 QQ 号
    const [_, qq] = user.split(':')

    logger.info(`Ban ${qq} in ${session.channelId}`)

    // 禁言对应用户
    ban(session.bot, config, Number(qq), Number(session.channelId))

    // 发送提示消息
    return (
      <>
        <at id={qq} />
        小伙伴你好~提问和发言前请先看群公告哦~不看群公告就发言会导致你被踢出本群，还请注意~
      </>
    )
  })

  // unban 指令
  ctx.command('verify/unban <user:user>').action(({ session }, user) => {
    // 获取 QQ 号
    const [_, qq] = user.split(':')

    logger.info(`Unban ${qq} in ${session.channelId}`)

    // 解禁对应用户
    unban(session.bot, config, Number(qq), Number(session.channelId))
  })

  // 自助解禁
  ctx.router.get('/unban', async (c) => {
    try {
      // 获得 QQ
      const qq = Number(c.query.qq)

      logger.info(`Self-unban: ${qq}`)

      // 检测 QQ 是否合法
      if (!(qq > 10000)) throw new Error()

      // 检查 QQ 是否在 verify 表里，且被禁言中
      const result = await ctx.database.get('verify', {
        qq,
        banned: {
          $ne: 0,
        },
      })

      // 对每个群解禁
      for (const r of result) {
        const bot = ctx.bots[0] as Bot

        await unban(bot as OneBotBot, config, qq, r.group)

        await bot.sendMessage(
          String(r.group),
          <>
            <at id={qq} />
            已成功解禁，小伙伴现在可以开始参与交流了~聊天时注意热情、友善哦~
          </>
        )
      }
    } catch (e: unknown) {
      logger.info(`Self-unban failed:`)
      logger.info(e)
    }
  })

  // clean 指令
  ctx
    .command('verify/clean')
    .option('yes', '-y')
    .action(async ({ options }) => {
      // 返回超过 3 天未自助解禁的用户
      const result = await ctx.database.get('verify', {
        $and: [
          {
            banned: {
              $ne: 0,
            },
          },
          {
            banned: {
              $lt: new Date().getTime() - 1000 * 60 * 60 * 24 * 3,
            },
          },
        ],
      })

      if (!result.length) return '目前没有超过 3 天未自助解禁的成员。'

      if (options.yes) {
        ;(async () => {
          for (const r of result) {
            await sleep(5000)
            logger.info(`Kick: ${r.qq} in ${r.group}`)
            ;(ctx.bots[0] as OneBotBot).internal.setGroupKickAsync(
              r.group,
              r.qq,
              false
            )
          }
        })()

        return `开始踢出 ${result.length} 名成员。`
      }

      return (
        <message forward>
          <message>以下 {result.length} 名成员超过 3 天未自助解禁：</message>
          {result.map((x) => (
            <message>
              所在群：{x.group}
              QQ：{x.qq}
            </message>
          ))}
          <message>使用 'clean -y' 自动踢出这些成员。</message>
        </message>
      )
    })
}
