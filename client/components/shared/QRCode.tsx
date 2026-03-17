'use client';

import { QRCodeSVG } from 'qrcode.react';

interface QRCodeProps {
  value: string;
  size?: number;
}

export const QRCode = ({ value, size = 200 }: QRCodeProps) => {
  return (
    <div className="bg-white p-4 rounded-xl inline-block">
      <QRCodeSVG
        value={value}
        size={size}
        bgColor="#FFFFFF"
        fgColor="#000000"
        level="M"
      />
    </div>
  );
};
