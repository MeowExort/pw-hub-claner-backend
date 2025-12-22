import { Injectable } from '@nestjs/common';

export interface ParsedFactionRecord {
  id: number;
  timestamp: number;
  who: number; // role_id
  type: number;
  params: number[];
  action: string;
  description: string;
  date: Date;
}

@Injectable()
export class FactionHistoryParser {
  // Structure from C++:
  // int type;            // 4 bytes
  // int id;              // 4 bytes
  // __time32_t timestamp;// 4 bytes
  // int who;             // 4 bytes
  // int params[3];       // 12 bytes
  // Total: 28 bytes
  private static readonly RECORD_SIZE = 28;
  private static readonly HEADER_SIZE = 8;

  parse(buffer: Buffer): ParsedFactionRecord[] {
    const records: ParsedFactionRecord[] = [];
    
    // Determine start offset based on potential header
    // Header struct: int32 from_id, int32 to_id.
    // Validity check: from_id <= to_id.
    let offset = 0;
    let maxRecords = -1;
    
    if (buffer.length >= FactionHistoryParser.HEADER_SIZE) {
      const fromId = buffer.readInt32LE(0);
      const toId = buffer.readInt32LE(4);
      
      // If valid header, skip it. 
      // Strict check: Ensure that the implied file size is not significantly larger than the actual buffer.
      // If it is, then the "header" is likely just data (random bytes happening to satisfy fromId <= toId).
      if (fromId <= toId) {
        const potentialMaxRecords = toId - fromId + 1;
        const expectedMinSize = FactionHistoryParser.HEADER_SIZE + potentialMaxRecords * FactionHistoryParser.RECORD_SIZE;
        
        // We allow some slack, but if the expected size is way larger than buffer, it's not a header.
        if (expectedMinSize <= buffer.length + FactionHistoryParser.RECORD_SIZE) {
           offset = FactionHistoryParser.HEADER_SIZE;
           maxRecords = potentialMaxRecords;
        }
      } else if (fromId === -1 && toId === -2) {
        offset = FactionHistoryParser.HEADER_SIZE;
        maxRecords = 0;
      }
    }

    // Read records until buffer end
    while (offset + FactionHistoryParser.RECORD_SIZE <= buffer.length) {
      if (maxRecords !== -1 && records.length >= maxRecords) {
        break;
      }

      const type = buffer.readInt32LE(offset);
      const id = buffer.readInt32LE(offset + 4);
      const timestamp = buffer.readInt32LE(offset + 8);
      const who = buffer.readInt32LE(offset + 12);
      const p0 = buffer.readInt32LE(offset + 16);
      const p1 = buffer.readInt32LE(offset + 20);
      const p2 = buffer.readInt32LE(offset + 24);
      const params = [p0, p1, p2];

      // Sanitize params based on type to remove garbage from unused fields
      switch (type) {
        case 0: // item
        case 1: // valor
        case 2: // money
        case 5: // invite
        case 10: // expel
          params[1] = 0;
          params[2] = 0;
          break;
        case 6: // join
        case 7: // refuse
        case 8: // leave
          params[0] = 0;
          params[1] = 0;
          params[2] = 0;
          break;
        case 9: // role
          // All params used
          break;
      }

      const { action, description } = this.decode(type, who, params);

      records.push({
        id,
        timestamp,
        who,
        type,
        params,
        action,
        description,
        date: new Date(timestamp * 1000), // timestamp is seconds (time_t)
      });
      
      offset += FactionHistoryParser.RECORD_SIZE;
    }

    return records;
  }

  private decode(type: number, who: number, params: number[]): { action: string, description: string } {
    let action = '';
    let description = '';

    switch (type) {
      case 0:
        action = 'Получает предмет';
        description = `Игрок {role_id:${who}} получает предмет {item_id:${params[0]}}.`;
        break;

      case 1:
        action = 'Вносит вклад (доблесть)';
        description = `Игрок {role_id:${who}} вносит вклад ${params[0]} очков доблести.`;
        break;

      case 2:
        action = 'Вносит вклад (золото)';
        description = `Игрок {role_id:${who}} вносит вклад ${params[0]} золота гильдии.`;
        break;

      case 5:
        action = 'Приглашает игрока';
        description = `Игрок {role_id:${who}} приглашает игрока {role_id:${params[0]}} в гильдию.`;
        break;

      case 6:
        action = 'Вступает в гильдию';
        description = `Игрок {role_id:${who}} вступает в гильдию.`;
        break;

      case 7:
        action = 'Отказывается вступить в гильдию';
        description = `Игрок {role_id:${who}} отказывается вступить в гильдию.`;
        break;

      case 8:
        action = 'Покидает гильдию';
        description = `Игрок {role_id:${who}} покидает гильдию.`;
        break;

      case 9:
        const role = this.decodeFactionRole(params[1]);
        action = 'Изменяет должность';
        const operation = params[2] === 1 ? 'повышает' : 'понижает';
        description = `Игрок {role_id:${who}} ${operation} игрока {role_id:${params[0]}} до должности ${role}.`;
        break;

      case 10:
        action = 'Изгоняет игрока';
        description = `Игрок {role_id:${who}} изгоняет игрока {role_id:${params[0]}} из гильдии.`;
        break;

      default:
        action = `Неизвестное действие ${type}`;
        description = '';
    }

    return { action, description };
  }

  private decodeFactionRole(role: number): string {
    switch (role) {
      case 2: return 'Мастер';
      case 3: return 'Маршал';
      case 4: return 'Майор';
      case 5: return 'Капитан';
      case 6: return 'Рядовой';
      default: return `Неизвестная должность ${role}`;
    }
  }
}
