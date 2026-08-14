export type ReleaseBundleDefinition = {
  id: string;
  version: string;
  bundleHash: string;
  isActive: boolean;
};

export class ReleaseBundleRegistry {
  private readonly bundles = new Map<string, ReleaseBundleDefinition>();

  register(bundle: ReleaseBundleDefinition) {
    this.bundles.set(bundle.id, Object.freeze({ ...bundle }));
  }

  getUsable(bundleId: string) {
    const bundle = this.bundles.get(bundleId);

    return bundle?.isActive ? bundle : null;
  }
}
