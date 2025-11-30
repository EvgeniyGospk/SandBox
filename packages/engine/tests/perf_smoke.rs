use particula_engine::World;

#[test]
fn perf_smoke_step() {
    let mut world = World::new(128, 64);
    world.enable_perf_metrics(true);
    for x in 0..128 {
        for y in 0..32 {
            world.add_particle(x, y, 2); // sand
        }
    }
    world.step();
    let stats = world.get_perf_stats();
    assert!(stats.step_ms() >= 0.0);
}
