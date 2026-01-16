import { Update, Start, Action, Command, Ctx } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

@Update()
export class TelegramBotUpdate {
  constructor(
    private prisma: PrismaService,
    private eventsService: EventsService
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    const text = (ctx.message as any).text;
    const otp = text.split(' ')[1];

    if (!otp) {
      await ctx.reply('Добро пожаловать в PW Hub Clanner Bot! Для привязки аккаунта введите команду /bind <code> или используйте ссылку с сайта.');
      return;
    }

    await this.bindUser(ctx, otp);
  }

  @Command('bind')
  async onBind(@Ctx() ctx: Context) {
    const text = (ctx.message as any).text;
    const otp = text.split(' ')[1];

    if (!otp) {
      await ctx.reply('Пожалуйста, укажите код подтверждения: /bind <code>');
      return;
    }

    await this.bindUser(ctx, otp);
  }

  private async bindUser(ctx: Context, otp: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        otpCode: otp,
        otpExpiresAt: { gte: new Date() },
      },
    });

    if (!user) {
      await ctx.reply('Неверный или просроченный код подтверждения.');
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        telegramId: ctx.from.id.toString(),
        telegramUsername: ctx.from.username,
        otpCode: null,
        otpExpiresAt: null,
        notificationSettings: {
          upsert: {
            create: {},
            update: {},
          },
        },
      },
    });

    await ctx.reply(`Аккаунт ${user.username} успешно привязан!`);
  }

  @Command('setup_claner')
  async setupClanHub(@Ctx() ctx: Context) {
    const chat = ctx.chat;
    if (chat.type !== 'group' && chat.type !== 'supergroup') {
      await ctx.reply('Эту команду можно использовать только в группах.');
      return;
    }

    // Проверка прав мастера будет на стороне фронта/логики настройки.
    // Но здесь мы можем выдать ID группы для настройки.
    const threadId = (ctx.message as any).message_thread_id;
    
    await ctx.reply(
      `Настройка интеграции:\nID группы: <code>${chat.id}</code>${
        threadId ? `\nID топика: <code>${threadId}</code>` : ''
      }\nВведите эти данные в настройках клана на сайте.`,
      { parse_mode: 'HTML' }
    );
  }

  @Action(/app_vote:(.+):(.+)/)
  async onApplicationVote(@Ctx() ctx: Context) {
    const [, appId, voteType] = (ctx as any).match;
    const telegramId = ctx.from.id.toString();

    const user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: { characters: { include: { clan: true } } },
    });

    if (!user || !user.mainCharacterId) {
      await ctx.answerCbQuery('Ваш аккаунт не привязан или не выбран основной персонаж.');
      return;
    }

    const application = await this.prisma.clanApplication.findUnique({
      where: { id: appId },
    });

    if (!application) {
      await ctx.answerCbQuery('Заявка не найдена.');
      return;
    }

    const character = user.characters.find(c => c.id === user.mainCharacterId);
    if (!character || character.clanId !== application.clanId) {
      await ctx.answerCbQuery('Вы не состоите в этом клане.');
      return;
    }

    const voteValue = voteType === 'like' ? 1 : -1;

    await this.prisma.applicationVote.upsert({
      where: {
        applicationId_characterId: {
          applicationId: appId,
          characterId: character.id,
        },
      },
      create: {
        applicationId: appId,
        characterId: character.id,
        vote: voteValue,
      },
      update: {
        vote: voteValue,
      },
    });

    await ctx.answerCbQuery('Ваш голос учтен!');

    // Update message with new counts
    const votes = await this.prisma.applicationVote.findMany({
      where: { applicationId: appId },
    });

    const likes = votes.filter((v) => v.vote === 1).length;
    const dislikes = votes.filter((v) => v.vote === -1).length;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(`👍 ${likes}`, `app_vote:${appId}:like`),
        Markup.button.callback(`👎 ${dislikes}`, `app_vote:${appId}:dislike`),
      ],
    ]);

    try {
      await ctx.editMessageReplyMarkup(keyboard.reply_markup);
    } catch (e) {
      // Ignore errors if markup is the same
    }
  }

  @Action(/event_rsvp:(.+)/)
  async onEventRsvp(@Ctx() ctx: Context) {
    const match = (ctx as any).match[1].split(':');
    let eventId: string;
    let characterId: string | null = null;
    let status: string;

    if (match.length === 3) {
      // event_rsvp:eventId:characterId:status -> eventId, characterId, status
      [eventId, characterId, status] = match;
    } else {
      // event_rsvp:eventId:status -> eventId, status
      [eventId, status] = match;
    }

    const telegramId = ctx.from.id.toString();

    const user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: { characters: { include: { clan: true } } },
    });

    if (!user) {
      await ctx.answerCbQuery('Ваш аккаунт не привязан.');
      return;
    }

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { clanWeeklyContext: true }
    });

    if (!event) {
      await ctx.answerCbQuery('Событие не найдено.');
      return;
    }

    // Determine character
    let character = null;
    if (characterId) {
      character = user.characters.find(c => c.id === characterId || c.shortId === characterId);
    } else {
      character = user.characters.find(c => c.id === user.mainCharacterId);
    }

    if (!character || character.clanId !== event.clanWeeklyContext.clanId) {
      await ctx.answerCbQuery('Персонаж не найден или не в этом клане.');
      return;
    }

    await this.prisma.eventParticipant.upsert({
        where: { eventId_characterId: { eventId, characterId: character.id } },
        create: { eventId, characterId: character.id, status },
        update: { status }
    });

    await ctx.answerCbQuery('Статус обновлен!');

    // Trigger updates for ALL relevant messages
    await this.eventsService.updateTelegramMessages(eventId, character.id);
  }
}
