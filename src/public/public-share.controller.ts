import { Controller, Get, Param, Res, Header } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { Response } from 'express';
import { calculatePowerDetails } from '../common/utils/power';

@Controller('public/share')
export class PublicShareController {
  constructor(private readonly usersService: UsersService) {}

  @Get('character/:id')
  async getCharacterShare(@Param('id') id: string, @Res() res: Response) {
    try {
      const char = await this.usersService.getPublicCharacter(id);
      const powerDetails = calculatePowerDetails(char);

      const title = `${char.name} - ${char.class} ${char.level} ур.`;
      const description = `Боевая мощь: ${powerDetails.total.toLocaleString('ru-RU')}. Сервер: ${char.server}. Посмотри профиль персонажа на PW Hub!`;
      
      const protocol = res.req.protocol;
      const host = res.req.get('host');
      // В Telegram лучше передавать абсолютный URL с https, если мы на проде
      const baseUrl = host.includes('localhost') ? `http://${host}/api` : `https://api.claner.pw-hub.ru/api`;
      const imageUrl = `${baseUrl}/public/share/character/${id}/image.svg`;

      const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="description" content="${description}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:title" content="${title}">
    <meta property="twitter:description" content="${description}">
    <meta property="twitter:image" content="${imageUrl}">

    <!-- Redirect to frontend -->
    <script>
        window.location.href = "https://claner.pw-hub.ru/c/${id}";
    </script>
</head>
<body>
    <h1>${title}</h1>
    <p>${description}</p>
    <img src="${imageUrl}" alt="Character Power">
</body>
</html>
      `;
      res.send(html);
    } catch (e) {
      res.status(404).send('Character not found');
    }
  }

  @Get('character/:id/image.svg')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'public, max-age=3600')
  async getCharacterImage(@Param('id') id: string) {
    const char = await this.usersService.getPublicCharacter(id);
    const powerDetails = calculatePowerDetails(char);

    const width = 1200;
    const height = 630;

    // Простая генерация SVG
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1c23;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#2d313d;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
      <feOffset dx="2" dy="2" result="offsetblur" />
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.5" />
      </feComponentTransfer>
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  
  <rect width="100%" height="100%" fill="url(#grad1)" />
  
  <!-- Border -->
  <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="15" fill="none" stroke="#ff9e64" stroke-width="2" opacity="0.3" />

  <!-- Header -->
  <text x="60" y="100" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#ffffff" filter="url(#shadow)">${this.escapeXml(char.name)}</text>
  <text x="60" y="160" font-family="Arial, sans-serif" font-size="24" fill="#bbbbbb">${char.class} • ${char.server} • ${char.level} ур.</text>

  <!-- Power Section -->
  <rect x="700" y="80" width="440" height="200" rx="20" fill="#252832" stroke="#ff9e64" stroke-width="3" />
  <text x="920" y="130" font-family="Arial, sans-serif" font-size="20" text-anchor="middle" fill="#bbbbbb">БОЕВАЯ МОЩЬ</text>
  <text x="920" y="220" font-family="Arial, sans-serif" font-size="72" font-weight="900" text-anchor="middle" fill="#ff9e64" filter="url(#shadow)">${powerDetails.total.toLocaleString('ru-RU')}</text>

  <!-- Stats Grid -->
  <g transform="translate(60, 250)">
    <g transform="translate(0, 0)">
      ${this.renderStatSvg("Атака", `${char.minAttack}-${char.maxAttack}`, 0)}
      ${this.renderStatSvg("ПА / ПЗ", `${char.attackLevel} / ${char.defenseLevel}`, 40)}
      ${this.renderStatSvg("Боевой дух", char.spirit, 80)}
      ${this.renderStatSvg("Здоровье (HP)", char.health, 120)}
    </g>
    <g transform="translate(350, 0)">
      ${this.renderStatSvg("Физ. защита", char.physDef, 0)}
      ${this.renderStatSvg("Маг. защита", char.magDef, 40)}
      ${this.renderStatSvg("Крит. шанс", `${char.critChance}%`, 80)}
      ${this.renderStatSvg("Крит. урон", `${char.critDamage}%`, 120)}
    </g>
  </g>

  <!-- Footer -->
  <text x="${width - 60}" y="${height - 60}" font-family="Arial, sans-serif" font-size="18" text-anchor="end" fill="#555555">pw-hub.ru</text>
</svg>
    `;
    return svg;
  }

  private renderStatSvg(label: string, value: any, y: number) {
    return `
      <text x="0" y="${y}" font-family="Arial, sans-serif" font-size="20" fill="#888888">${label}:</text>
      <text x="280" y="${y}" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#ffffff" text-anchor="end">${value}</text>
    `;
  }

  private escapeXml(unsafe: string) {
    return unsafe.replace(/[<>&"']/g, (m) => {
      switch (m) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '"': return '&quot;';
        case "'": return '&apos;';
        default: return m;
      }
    });
  }
}
