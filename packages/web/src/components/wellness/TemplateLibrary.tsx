import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Eye, Copy, Sparkles } from 'lucide-react';
import { useWellnessLibrary } from '@/hooks/use-wellness-library';
import TemplatePreviewModal from './TemplatePreviewModal';
import type { WellnessTemplate } from '@shared/wellness-types';

interface TemplateLibraryProps {
  organizationId: string;
}

const CATEGORIES = ['all', 'general', 'recovery', 'performance', 'injury', 'training'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_LABELS: Record<Category, string> = {
  all: 'All',
  general: 'General',
  recovery: 'Recovery',
  performance: 'Performance',
  injury: 'Injury',
  training: 'Training',
};

export default function TemplateLibrary({ organizationId }: TemplateLibraryProps) {
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<WellnessTemplate | null>(null);

  // Fetch library data
  const { data: libraryData, isLoading } = useWellnessLibrary(organizationId, {
    category: selectedCategory === 'all' ? undefined : selectedCategory,
    search: searchQuery || undefined,
    tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
  });

  // Combine system and org templates
  const allTemplates = useMemo(() => {
    if (!libraryData) return [];
    return [...libraryData.systemTemplates, ...libraryData.orgTemplates];
  }, [libraryData]);

  // Extract all unique tags from visible templates
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    allTemplates.forEach((template) => {
      if (template.tags) {
        template.tags.forEach((tag) => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [allTemplates]);

  // Filter templates by search and tags
  const filteredTemplates = useMemo(() => {
    let filtered = allTemplates;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (template) =>
          template.name.toLowerCase().includes(query) ||
          template.description?.toLowerCase().includes(query)
      );
    }

    // Tag filter (already applied via API, but we apply client-side for immediate feedback)
    if (selectedTags.length > 0) {
      filtered = filtered.filter((template) =>
        selectedTags.some((tag) => template.tags?.includes(tag))
      );
    }

    return filtered;
  }, [allTemplates, searchQuery, selectedTags]);

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handlePreview = (template: WellnessTemplate) => {
    setPreviewTemplate(template);
  };

  const handleClosePreview = () => {
    setPreviewTemplate(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Template Library</h2>
        <p className="text-gray-600">
          Browse pre-built wellness templates and clone them to your organization
        </p>
      </div>

      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={(val) => setSelectedCategory(val as Category)}>
        <TabsList>
          {CATEGORIES.map((category) => (
            <TabsTrigger key={category} value={category} role="tab">
              {CATEGORY_LABELS[category]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search and Filters */}
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search templates by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-templates"
          />
        </div>

        {/* Tag Filters */}
        {availableTags.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Filter by tags:</p>
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => (
                <Badge
                  key={tag}
                  variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                  className="cursor-pointer hover:bg-gray-100"
                  onClick={() => handleToggleTag(tag)}
                  data-testid={`tag-filter-${tag}`}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Active Filters Summary */}
        {(searchQuery || selectedTags.length > 0) && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>
              Showing {filteredTemplates.length} of {allTemplates.length} templates
            </span>
            {(searchQuery || selectedTags.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTags([]);
                }}
                className="h-7 text-xs"
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Template Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : filteredTemplates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <Card
              key={template.id}
              className="hover:shadow-lg transition-shadow flex flex-col"
              data-testid={`template-card-${template.id}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <CardTitle className="text-lg flex-1">{template.name}</CardTitle>
                  {template.isSystemSeeded && (
                    <Badge variant="secondary" className="text-xs flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      System
                    </Badge>
                  )}
                </div>
                <CardDescription className="line-clamp-2">
                  {template.description || 'No description provided'}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col space-y-4">
                {/* Category Badge */}
                {template.category && (
                  <div>
                    <Badge variant="outline">{template.category}</Badge>
                  </div>
                )}

                {/* Tags */}
                {template.tags && template.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {template.tags.slice(0, 4).map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {template.tags.length > 4 && (
                      <Badge variant="secondary" className="text-xs">
                        +{template.tags.length - 4} more
                      </Badge>
                    )}
                  </div>
                )}

                {/* Question Count */}
                <div className="text-sm text-gray-600">
                  {template.config.questions.length} question
                  {template.config.questions.length !== 1 ? 's' : ''}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(template)}
                    className="flex-1"
                    data-testid={`button-preview-${template.id}`}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handlePreview(template)}
                    className="flex-1"
                    data-testid={`button-clone-${template.id}`}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Clone
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-gray-50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-gray-600 text-center mb-4">
              {searchQuery || selectedTags.length > 0
                ? 'No templates match your filters. Try adjusting your search or filters.'
                : 'No templates available in this category.'}
            </p>
            {(searchQuery || selectedTags.length > 0) && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTags([]);
                }}
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <TemplatePreviewModal
          isOpen={!!previewTemplate}
          onClose={handleClosePreview}
          template={previewTemplate}
          organizationId={organizationId}
          showCloneButton={true}
        />
      )}
    </div>
  );
}
