import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { WellnessRequest } from '@shared/wellness-types';

interface QRCodeGeneratorProps {
  request: WellnessRequest;
  isOpen: boolean;
  onClose: () => void;
}

export default function QRCodeGenerator({ request, isOpen, onClose }: QRCodeGeneratorProps) {
  const { toast } = useToast();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate wellness link
  const wellnessLink = `${window.location.origin}/wellness/submit/${request.publicToken}`;

  useEffect(() => {
    if (isOpen && wellnessLink) {
      QRCode.toDataURL(wellnessLink, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      }).then((url: string) => {
        setQrCodeDataUrl(url);
      }).catch((error: Error) => {
        console.error('Failed to generate QR code:', error);
        toast({
          title: 'Error',
          description: 'Failed to generate QR code',
          variant: 'destructive',
        });
      });
    }
  }, [isOpen, wellnessLink, toast]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(wellnessLink);
      toast({
        title: 'Success',
        description: 'Link copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = qrCodeDataUrl;
    link.download = `wellness-qr-${request.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: 'Success',
      description: 'QR code downloaded',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="qr-code-modal">
        <DialogHeader>
          <DialogTitle>Wellness Questionnaire QR Code</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex justify-center">
            {qrCodeDataUrl ? (
              <img
                src={qrCodeDataUrl}
                alt="QR Code"
                className="w-full max-w-sm rounded-md border"
                data-testid="qr-code-image"
              />
            ) : (
              <div className="w-full max-w-sm h-64 bg-gray-100 rounded-md flex items-center justify-center">
                <p className="text-gray-500">Generating QR code...</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Shareable Link:</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={wellnessLink}
                className="flex-1 px-3 py-2 border rounded-md text-sm bg-gray-50"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                data-testid="button-copy-qr-link"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDownload}
              disabled={!qrCodeDataUrl}
              data-testid="button-download-qr"
            >
              <Download className="h-4 w-4 mr-2" />
              Download QR Code
            </Button>
            <Button onClick={onClose} className="flex-1">
              Done
            </Button>
          </div>

          <p className="text-xs text-gray-600 text-center">
            Athletes can scan this QR code or use the link to access the questionnaire
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
