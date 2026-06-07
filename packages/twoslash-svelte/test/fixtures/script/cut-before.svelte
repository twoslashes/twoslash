<script>
    let count = $state(0);
    // ---cut-before---
    function increment() {
        count++;
    }
</script>
<script module>
    let count2 = $state(0);
    // ---cut-before---
    function increment2() {
        count2++;
    }
</script>
<button onclick={increment}>
    Count is: {count}
</button>