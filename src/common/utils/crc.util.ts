/**
 * CRC-ITU (CRC-16-CCITT) calculation for GT06 protocol
 * Polynomial: 0x1021
 * Initial value: 0xFFFF
 */
export class CrcUtil {
  private static readonly CRC_TABLE: number[] = CrcUtil.generateCrcTable();

  private static generateCrcTable(): number[] {
    const table: number[] = [];
    const polynomial = 0x1021;

    for (let i = 0; i < 256; i++) {
      let crc = i << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ polynomial) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
      table.push(crc);
    }

    return table;
  }

  static calculateCrc(data: Buffer): number {
    let crc = 0xffff;

    for (let i = 0; i < data.length; i++) {
      const index = ((crc >> 8) ^ data[i]) & 0xff;
      crc = ((crc << 8) ^ this.CRC_TABLE[index]) & 0xffff;
    }

    return crc;
  }

  static validateCrc(data: Buffer, expectedCrc: number): boolean {
    const calculatedCrc = this.calculateCrc(data);
    return calculatedCrc === expectedCrc;
  }

  static appendCrc(data: Buffer): Buffer {
    const crc = this.calculateCrc(data);
    const result = Buffer.alloc(data.length + 2);
    data.copy(result);
    result.writeUInt16BE(crc, data.length);
    return result;
  }
}
