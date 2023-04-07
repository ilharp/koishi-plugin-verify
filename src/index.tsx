import OneBotBot from '@koishijs/plugin-adapter-onebot'
import { Context, Schema } from 'koishi'

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export const name = 'verify'

export interface Config {
  banDuration: number
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    banDuration: Schema.number().default(30 * 24 * 60 * 60),
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
const ban = (ctx: Context, config: Config, qq: number, group: number) => {
  ;(ctx.bots[0] as OneBotBot).internal.setGroupBanAsync(
    group,
    qq,
    config.banDuration
  )

  ctx.database.upsert('verify', [
    {
      qq,
      group,
      banned: new Date().getTime(),
    },
  ])
}

/**
 * 解禁
 */
const unban = (ctx: Context, config: Config, qq: number, group: number) => {
  ;(ctx.bots[0] as OneBotBot).internal.setGroupBanAsync(group, qq, 0)

  ctx.database.upsert('verify', [
    {
      qq,
      group,
      banned: 0,
    },
  ])
}

/**
 * 踢出成员
 */
const kick = async (ctx: Context, result: Verify[]) => {
  for (const r of result) {
    await delay(5000)
    await (ctx.bots[0] as OneBotBot).internal.setGroupKick(r.group, r.qq, false)
  }
}

export function apply(ctx: Context, config: Config) {
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
    }
  )

  // 有人加群时
  ctx.on('guild-member-added', (session) => {
    // 禁言对应用户
    ban(ctx, config, Number(session.operatorId), Number(session.channelId))

    // 发送入群欢迎消息
    session.sendQueued(
      <>
        <at id="session.operatorId" />
        欢迎小伙伴入群~请认真阅读群公告，阅读后即可参与讨论哦~
      </>
    )
  })

  // ban 指令
  ctx.command('ban <user:user>').action(({ session }, user) => {
    // 禁言对应用户
    // TODO: 怎么识别 at 人
    ban(ctx, config, Number(user), Number(session.channelId))
  })

  // unban 指令
  ctx.command('unban <user:user>').action(({ session }, user) => {
    // 禁言对应用户
    // TODO: 怎么识别 at 人
    unban(ctx, config, Number(user), Number(session.channelId))
  })

  // 自助解禁
  ctx.router.get('/unban', async (c) => {
    try {
      // 获得 QQ
      const qq = Number(c.query.qq)

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
      for (const r of result) unban(ctx, config, qq, r.group)
    } catch (e: unknown) {
      // Ignore
    }
  })

  // clean 指令
  ctx
    .command('clean')
    .option('yes', '-y')
    .action(async ({ options }) => {
      // 返回超过 15 天未自助解禁的用户
      const result = await ctx.database.get('verify', {
        banned: {
          $ne: 0,
          $lt: new Date().getTime() - 1000 * 60 * 60 * 24 * 15,
        },
      })

      if (!result.length) return '目前没有超过 15 天未自助解禁的成员。'

      if (options.yes) {
        kick(ctx, result)
        return '开始踢出 ${result.length} 名成员。'
      }

      return (
        <message forward>
          <message>以下 ${result.length} 名成员超过 15 天未自助解禁：</message>$
          {result.map((x) => (
            <message>
              所在群：${x.group}QQ：${x.qq}
            </message>
          ))}
          <message>使用 'clean -y' 自动踢出这些成员。</message>
        </message>
      )
    })
}