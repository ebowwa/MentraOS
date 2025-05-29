import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Brain, ChevronDown, ChevronRight, Settings, GripVertical } from "lucide-react";
import { Tool } from '@/types/tpa';

interface ToolsEditorProps {
  tools: Tool[];
  onChange: (tools: Tool[]) => void;
  className?: string;
}

/**
 * Compact tool item component with mobile-friendly expandable editing
 */
interface ToolItemProps {
  tool: any;
  index: number;
  isEditing: boolean;
  onEditToggle: (index: number | null) => void;
  removeTool: (index: number) => void;
  updateTool: (index: number, updates: any) => void;
  updateActivationPhrasesRaw: (index: number, value: string) => void;
  parseActivationPhrases: (index: number, value: string) => void;
  addParameter: (toolIndex: number) => void;
  removeParameter: (toolIndex: number, paramKey: string) => void;
  updateParameter: (toolIndex: number, paramKey: string, updates: any) => void;
  updateParameterKey: (toolIndex: number, oldKey: string, newKey: string) => void;
}

const ToolItem: React.FC<ToolItemProps> = ({
  tool,
  index,
  isEditing,
  onEditToggle,
  removeTool,
  updateTool,
  updateActivationPhrasesRaw,
  parseActivationPhrases,
  addParameter,
  removeParameter,
  updateParameter,
  updateParameterKey,
}) => {
  // Helper function to get display text
  const getDisplayText = () => {
    return tool.id || 'untitled_tool';
  };

  // Helper function to get parameter count
  const getParameterCount = () => {
    return Object.keys(tool.parameters || {}).length;
  };

  // Helper function to get activation phrases preview
  const getActivationPhrasesPreview = () => {
    const phrases = tool.activationPhrases || [];
    if (phrases.length === 0) return 'No phrases';
    if (phrases.length <= 2) return phrases.join(', ');
    return `${phrases.slice(0, 2).join(', ')}, +${phrases.length - 2} more`;
  };

  // Helper function to get the raw activation phrases string for editing
  const getActivationPhrasesString = () => {
    // If we have a raw string stored, use that for editing
    if (tool.activationPhrasesRaw !== undefined) {
      return tool.activationPhrasesRaw;
    }
    // Otherwise, convert the array back to a string
    return (tool.activationPhrases || []).join(', ');
  };

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      {!isEditing ? (
        // Collapsed view - just show the essential info
        <div
          className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => onEditToggle(index)}
        >
          <div className="flex items-center gap-3">
            {/* Content preview */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Brain className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <span className="font-medium text-sm text-gray-900 truncate">
                  {getDisplayText()}
                </span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  {getParameterCount()} params
                </span>
              </div>
              <div className="flex flex-col gap-1 text-xs text-gray-500">
                <span className="truncate">
                  {tool.description || 'No description'}
                </span>
                <span className="truncate">
                  Phrases: {getActivationPhrasesPreview()}
                </span>
              </div>
            </div>

            {/* Delete button */}
            <Button
              onClick={(e) => {
                e.stopPropagation();
                removeTool(index);
              }}
              variant="ghost"
              size="sm"
              type="button"
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        // Expanded editing view
        <div className="p-4">
          {/* Header with close button */}
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Edit AI Tool
            </h4>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => onEditToggle(null)}
                variant="outline"
                size="sm"
                type="button"
                className="h-8 px-3 text-xs"
              >
                Done
              </Button>
              <Button
                onClick={() => removeTool(index)}
                variant="ghost"
                size="sm"
                type="button"
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            {/* Tool ID */}
            <div>
              <Label className="text-sm font-medium">Tool ID</Label>
              <Input
                value={tool.id || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTool(index, { id: e.target.value })}
                placeholder="e.g., search_notes"
                className="mt-1 font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Unique identifier (alphanumeric, no spaces)
              </p>
            </div>

            {/* Description */}
            <div>
              <Label className="text-sm font-medium">Description</Label>
              <Textarea
                value={tool.description || ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateTool(index, { description: e.target.value })}
                placeholder="Describe what this tool does..."
                rows={3}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Clear description for the AI to understand
              </p>
            </div>

            {/* Activation Phrases */}
            <div>
              <Label className="text-sm font-medium">Activation Phrases</Label>
              <Input
                value={getActivationPhrasesString()}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateActivationPhrasesRaw(index, e.target.value)}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => parseActivationPhrases(index, e.target.value)}
                placeholder="search my notes, find information, look up"
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Comma-separated phrases that trigger this tool
              </p>
            </div>

            {/* Parameters */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-medium">Parameters</Label>
                <Button
                  onClick={() => addParameter(index)}
                  variant="outline"
                  size="sm"
                  type="button"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Parameter
                </Button>
              </div>

              {Object.keys(tool.parameters || {}).length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm border-2 border-dashed rounded">
                  No parameters defined. Parameters allow the tool to receive additional data.
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(tool.parameters || {}).map(([paramKey, param]: [string, any], paramIndex: number) => (
                    <div key={`param-${index}-${paramIndex}`} className="bg-gray-50 rounded-lg p-4 border">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="font-medium text-sm">Parameter: {paramKey}</h5>
                          <Button
                            onClick={() => removeParameter(index, paramKey)}
                            variant="ghost"
                            size="sm"
                            type="button"
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Parameter Name</Label>
                            <Input
                              value={paramKey}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateParameterKey(index, paramKey, e.target.value)}
                              placeholder="parameter_name"
                              className="mt-1 font-mono"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Type</Label>
                            <Select
                              value={param.type || 'string'}
                              onValueChange={(value) => updateParameter(index, paramKey, { type: value })}
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="string">String</SelectItem>
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="boolean">Boolean</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs">Description</Label>
                          <Textarea
                            value={param.description || ''}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateParameter(index, paramKey, { description: e.target.value })}
                            placeholder="Describe this parameter..."
                            rows={2}
                            className="mt-1"
                          />
                        </div>

                        <div className="flex items-start gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              checked={param.required || false}
                              onCheckedChange={(checked) => updateParameter(index, paramKey, { required: checked })}
                            />
                            <Label className="text-xs">Required parameter</Label>
                          </div>

                          {param.type === 'string' && (
                            <div className="flex-1">
                              <Label className="text-xs">Enum Values (optional)</Label>
                              <Input
                                value={param.enumRaw !== undefined ? param.enumRaw : (param.enum || []).join(', ')}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                  updateParameter(index, paramKey, { enumRaw: e.target.value });
                                }}
                                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                                  const enumValues = e.target.value.split(',').map((v: string) => v.trim()).filter((v: string) => v.length > 0);
                                  updateParameter(index, paramKey, {
                                    enum: enumValues.length > 0 ? enumValues : undefined,
                                    enumRaw: undefined
                                  });
                                }}
                                placeholder="option1, option2, option3"
                                className="mt-1"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Compact tools editor component with mobile-friendly design
 */
const ToolsEditor: React.FC<ToolsEditorProps> = ({ tools, onChange, className }) => {
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);

  // Helper function to create a new empty tool
  const createEmptyTool = (): any => ({
    id: '',
    description: '',
    activationPhrases: [],
    parameters: {}
  });

  // Add a new tool
  const addTool = () => {
    const newTool = createEmptyTool();
    const newTools = [...tools, newTool];
    onChange(newTools);
    // Auto-expand the newly added tool for editing
    setEditingIndex(newTools.length - 1);
  };

  // Remove a tool
  const removeTool = (index: number) => {
    const newTools = tools.filter((_, i) => i !== index);
    onChange(newTools);
    // If we're removing the currently editing item, clear the editing state
    if (editingIndex === index) {
      setEditingIndex(null);
    } else if (editingIndex !== null && editingIndex > index) {
      // If we're removing an item before the currently editing one, adjust the index
      setEditingIndex(editingIndex - 1);
    }
  };

  // Update a tool
  const updateTool = (index: number, updates: any) => {
    const newTools = [...tools];
    newTools[index] = { ...newTools[index], ...updates };
    onChange(newTools);
  };

  // Handle activation phrases (comma-separated string to array)
  const updateActivationPhrasesRaw = (index: number, value: string) => {
    // Store the raw string value for editing
    updateTool(index, { activationPhrasesRaw: value });
  };

  // Parse activation phrases (string to array)
  const parseActivationPhrases = (index: number, value: string) => {
    const phrases = value.split(',').map(phrase => phrase.trim()).filter(phrase => phrase.length > 0);
    updateTool(index, { activationPhrases: phrases, activationPhrasesRaw: undefined });
  };

  // Add parameter to a tool
  const addParameter = (toolIndex: number) => {
    const tool: any = tools[toolIndex];
    const newParameters = { ...tool.parameters };
    const newKey = `param${Object.keys(newParameters).length + 1}`;
    newParameters[newKey] = {
      type: 'string',
      description: '',
      required: false
    };
    updateTool(toolIndex, { parameters: newParameters });
  };

  // Remove parameter from a tool
  const removeParameter = (toolIndex: number, paramKey: string) => {
    const tool: any = tools[toolIndex];
    const newParameters = { ...tool.parameters };
    delete newParameters[paramKey];
    updateTool(toolIndex, { parameters: newParameters });
  };

  // Update parameter
  const updateParameter = (toolIndex: number, paramKey: string, updates: any) => {
    const tool: any = tools[toolIndex];
    const newParameters = { ...tool.parameters };
    newParameters[paramKey] = { ...newParameters[paramKey], ...updates };
    updateTool(toolIndex, { parameters: newParameters });
  };

  // Update parameter key (rename)
  const updateParameterKey = (toolIndex: number, oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;

    const tool: any = tools[toolIndex];
    const newParameters = { ...tool.parameters };

    // Move the parameter to the new key
    newParameters[newKey] = newParameters[oldKey];
    delete newParameters[oldKey];

    updateTool(toolIndex, { parameters: newParameters });
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Tools
          </h3>
          <p className="text-sm text-gray-600">
            Define AI tools for voice interactions
          </p>
        </div>
        <Button
          onClick={addTool}
          size="sm"
          type="button"
          className="h-8 px-3"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Tool
        </Button>
      </div>

      {tools.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Brain className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No AI tools defined yet.</p>
          <p className="text-sm">Add your first tool to enable AI interactions.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tools.map((tool: any, index) => (
            <ToolItem
              key={index}
              tool={tool}
              index={index}
              isEditing={editingIndex === index}
              onEditToggle={setEditingIndex}
              removeTool={removeTool}
              updateTool={updateTool}
              updateActivationPhrasesRaw={updateActivationPhrasesRaw}
              parseActivationPhrases={parseActivationPhrases}
              addParameter={addParameter}
              removeParameter={removeParameter}
              updateParameter={updateParameter}
              updateParameterKey={updateParameterKey}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolsEditor;