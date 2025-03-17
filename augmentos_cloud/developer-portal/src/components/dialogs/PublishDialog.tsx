import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AppResponse } from '@/services/api.service';
import api from '@/services/api.service';
import { toast } from 'sonner';
import { TPA } from '@/types/tpa';

interface PublishDialogProps {
  tpa: TPA | AppResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PublishDialog: React.FC<PublishDialogProps> = ({
  tpa,
  open,
  onOpenChange,
}) => {
  const [isPublishing, setIsPublishing] = React.useState(false);

  const handlePublish = async () => {
    try {
      setIsPublishing(true);
      await api.apps.publish(tpa.packageName);
      toast.success('App submitted for publication!');
      onOpenChange(false);
    } catch (error) {
      console.error('Error publishing app:', error);
      toast.error('Failed to publish app');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Publish App to Store</DialogTitle>
          <DialogDescription>
            Are you ready to publish "{tpa.name}" to the AugmentOS App Store?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-gray-600 mb-3">
            Publishing your app will make it available for review. Once approved, it will be visible to all AugmentOS users.
          </p>
          <p className="text-sm text-gray-600">
            Your app will initially be submitted in a <strong>SUBMITTED</strong> state and will need to undergo review before being published.
          </p>
        </div>

        <DialogFooter className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          
          <Button 
            onClick={handlePublish}
            disabled={isPublishing}
          >
            {isPublishing ? 'Publishing...' : 'Publish App'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PublishDialog;