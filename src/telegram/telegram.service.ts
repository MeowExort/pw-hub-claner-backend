import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TelegramService {
  constructor(
    @InjectBot() private bot: Telegraf<Context>,
    private prisma: PrismaService,
  ) {}

  async sendMessage(chatId: string, text: string, extra?: any): Promise<any> {
    try {
      return await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...extra,
      });
    } catch (e) {
      console.error(`Failed to send telegram message to ${chatId}`, e);
    }
  }

  async editMessage(chatId: string, messageId: number, text: string, extra?: any): Promise<any> {
    try {
      return await this.bot.telegram.editMessageText(chatId, messageId, undefined, text, {
        parse_mode: 'HTML',
        ...extra,
      });
    } catch (e) {
      console.error(`Failed to edit telegram message ${messageId} for ${chatId}`, e);
    }
  }

  async pinMessage(chatId: string, messageId: number) {
    try {
      await this.bot.telegram.pinChatMessage(chatId, messageId);
    } catch (e) {
      console.error(`Failed to pin telegram message ${messageId} for ${chatId}`, e);
    }
  }

  async deleteMessage(chatId: string, messageId: number) {
    try {
      await this.bot.telegram.deleteMessage(chatId, messageId);
    } catch (e: any) {
      // Message might be already deleted, expired or bot has no permission
      if (e?.description?.includes('message to delete not found') || 
          e?.description?.includes('message can\'t be deleted')) {
        return;
      }
      console.error(`Failed to delete telegram message ${messageId} for ${chatId}`, e);
    }
  }
}
