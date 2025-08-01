// components/forms/HardwareRequirementsForm.tsx
import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  X,
  Cpu,
  Camera,
  Mic,
  Speaker,
  Wifi,
  RotateCw,
  CircleDot,
  Lightbulb,
} from "lucide-react";
import {
  HardwareType,
  HardwareRequirementLevel,
  HardwareRequirement,
} from "@mentra/sdk";

interface HardwareRequirementsFormProps {
  requirements: HardwareRequirement[];
  onChange: (requirements: HardwareRequirement[]) => void;
}

const hardwareTypeIcons: Record<HardwareType, React.ReactNode> = {
  [HardwareType.CAMERA]: <Camera className="h-4 w-4" />,
  [HardwareType.DISPLAY]: <Cpu className="h-4 w-4" />,
  [HardwareType.MICROPHONE]: <Mic className="h-4 w-4" />,
  [HardwareType.SPEAKER]: <Speaker className="h-4 w-4" />,
  [HardwareType.IMU]: <RotateCw className="h-4 w-4" />,
  [HardwareType.BUTTON]: <CircleDot className="h-4 w-4" />,
  [HardwareType.LIGHT]: <Lightbulb className="h-4 w-4" />,
  [HardwareType.WIFI]: <Wifi className="h-4 w-4" />,
};

const hardwareTypeLabels: Record<HardwareType, string> = {
  [HardwareType.CAMERA]: "Camera",
  [HardwareType.DISPLAY]: "Display",
  [HardwareType.MICROPHONE]: "Microphone",
  [HardwareType.SPEAKER]: "Speaker",
  [HardwareType.IMU]: "IMU (Motion Sensors)",
  [HardwareType.BUTTON]: "Physical Button",
  [HardwareType.LIGHT]: "LED Light",
  [HardwareType.WIFI]: "WiFi",
};

const HardwareRequirementsForm: React.FC<HardwareRequirementsFormProps> = ({
  requirements,
  onChange,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newRequirement, setNewRequirement] = useState<
    Partial<HardwareRequirement>
  >({
    type: HardwareType.CAMERA,
    level: HardwareRequirementLevel.REQUIRED,
    description: "",
  });

  const handleAddRequirement = () => {
    if (newRequirement.type && newRequirement.level) {
      // Check if this hardware type is already added
      const existingIndex = requirements.findIndex(
        (req) => req.type === newRequirement.type,
      );

      if (existingIndex >= 0) {
        // Update existing requirement
        const updated = [...requirements];
        updated[existingIndex] = newRequirement as HardwareRequirement;
        onChange(updated);
      } else {
        // Add new requirement
        onChange([...requirements, newRequirement as HardwareRequirement]);
      }

      // Reset form
      setNewRequirement({
        type: HardwareType.CAMERA,
        level: HardwareRequirementLevel.REQUIRED,
        description: "",
      });
      setEditingIndex(null);
    }
  };

  const handleRemoveRequirement = (index: number) => {
    const updated = requirements.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleEditRequirement = (index: number) => {
    const req = requirements[index];
    setNewRequirement({
      type: req.type,
      level: req.level,
      description: req.description || "",
    });
    setEditingIndex(index);
  };

  // Get available hardware types (not already added unless editing)
  const availableTypes = Object.values(HardwareType).filter((type) => {
    const isAlreadyAdded = requirements.some((req) => req.type === type);
    return (
      !isAlreadyAdded ||
      (editingIndex !== null && requirements[editingIndex].type === type)
    );
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">Hardware Requirements</h3>
        <p className="text-sm text-gray-600 mb-4">
          Specify the hardware components your app needs to function properly.
          Users will be warned if their glasses don't meet these requirements.
        </p>
      </div>

      {/* List of existing requirements */}
      {requirements.length > 0 && (
        <div className="space-y-2 mb-4">
          {requirements.map((req, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="flex items-center gap-2">
                  {hardwareTypeIcons[req.type]}
                  <span className="font-medium">
                    {hardwareTypeLabels[req.type]}
                  </span>
                </div>
                <span
                  className={`text-sm px-2 py-1 rounded ${
                    req.level === HardwareRequirementLevel.REQUIRED
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {req.level === HardwareRequirementLevel.REQUIRED
                    ? "Required"
                    : "Optional"}
                </span>
                {req.description && (
                  <span className="text-sm text-gray-600 italic">
                    {req.description}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditRequirement(index)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveRequirement(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit requirement form */}
      <div className="border rounded-md p-4 bg-gray-50">
        <h4 className="font-medium mb-3">
          {editingIndex !== null
            ? "Edit Hardware Requirement"
            : "Add Hardware Requirement"}
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="hardware-type">Hardware Type</Label>
            <Select
              value={newRequirement.type}
              onValueChange={(value) =>
                setNewRequirement((prev) => ({
                  ...prev,
                  type: value as HardwareType,
                }))
              }
            >
              <SelectTrigger id="hardware-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center gap-2">
                      {hardwareTypeIcons[type]}
                      <span>{hardwareTypeLabels[type]}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="requirement-level">Requirement Level</Label>
            <Select
              value={newRequirement.level}
              onValueChange={(value) =>
                setNewRequirement((prev) => ({
                  ...prev,
                  level: value as HardwareRequirementLevel,
                }))
              }
            >
              <SelectTrigger id="requirement-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={HardwareRequirementLevel.REQUIRED}>
                  <span className="text-red-600">Required</span>
                </SelectItem>
                <SelectItem value={HardwareRequirementLevel.OPTIONAL}>
                  <span className="text-yellow-600">Optional</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              onClick={handleAddRequirement}
              disabled={!newRequirement.type || !newRequirement.level}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              {editingIndex !== null ? "Update" : "Add"}
            </Button>
          </div>
        </div>

        <div className="mt-3">
          <Label htmlFor="requirement-description">
            Description (Optional)
          </Label>
          <Textarea
            id="requirement-description"
            placeholder="Explain why this hardware is needed (e.g., 'Camera is required for QR code scanning')"
            value={newRequirement.description || ""}
            onChange={(e) =>
              setNewRequirement((prev) => ({
                ...prev,
                description: e.target.value,
              }))
            }
            className="mt-1"
            rows={2}
          />
        </div>

        {editingIndex !== null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingIndex(null);
              setNewRequirement({
                type: HardwareType.CAMERA,
                level: HardwareRequirementLevel.REQUIRED,
                description: "",
              });
            }}
            className="mt-2"
          >
            Cancel Edit
          </Button>
        )}
      </div>

      {requirements.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No hardware requirements specified. The app will be assumed to work
          with any hardware.
        </p>
      )}
    </div>
  );
};

export default HardwareRequirementsForm;
