<!-- ---cut-start--- -->
<script>
    let count = $state(0);
    
    function increment() {
        count++;
    }

</script>
<!-- ---cut-end--- -->

<button onclick={increment}>
    Count is: {count}
</button>